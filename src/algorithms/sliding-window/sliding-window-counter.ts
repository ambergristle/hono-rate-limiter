import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };

type IncrementArgs = [string, string, string, string];
type IncrementData = [number, number];

type SlidingWindowCounterOptions = {
  max: number;
  window: number;
}

export class SlidingWindowCounter implements Algorithm {

  private readonly client: RedisClient;

  public readonly max: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: SlidingWindowCounterOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const currentWindow = Math.floor(Date.now() / this.window);
    const currentKey = `${identifier}:${currentWindow}`;

    const used = await this.client.get<number>(currentKey) ?? 0;

    return {
      window: this.window,
      limit: this.max,
      remaining: Math.max(0, this.max - used),
      resetIn: (currentWindow + 1) * this.window,
    };
  }

  public async consume(identifier: string, cost: number): Promise<RateLimitResult> {
    const now = Date.now();

    const currentWindow = Math.floor(now / this.window);
    const currentKey = `${identifier}:${currentWindow}`;

    const previousWindow = currentWindow - 1;
    const previousKey = `${identifier}:${previousWindow}`;

    const [allowed, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [previousKey, currentKey],
      [
        this.window.toString(),
        this.max.toString(),
        cost.toString(),
        now.toString()
      ],
    );

    return {
      allowed: Boolean(allowed),
      window: this.window,
      limit: this.max,
      remaining,
      resetIn: (currentWindow + 1) * this.window,
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const used = await this.client.eval<[string], number>(
      refundScript,
      [identifier],
      [value.toString()],
    );

    return {
      remaining: this.max - used,
    }
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.eval(
      resetScript,
      [identifier],
      [], // null?
    );
  }
}
