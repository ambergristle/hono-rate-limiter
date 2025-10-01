import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };

type FixedWindowCounterOptions = {
  max: number;
  window: number;
}

export class FixedWindowCounter implements Algorithm {
  private readonly client: RedisClient;

  public readonly max: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: FixedWindowCounterOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await this.client.get<number>(key) ?? 0;

    return {
      window: this.window,
      limit: this.max,
      remaining: Math.max(0, this.max - used),
      resetIn: (currentWindow + 1) * this.window,
    };
  }

  public async consume(identifier: string, cost: number): Promise<RateLimitResult> {
    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await this.client.evalsha<[string, string], number>(
      await this.incrementScriptSha,
      [key],
      [
        this.window.toString(),
        cost.toString(),
      ],
    );

    return {
      allowed: used <= this.max,
      window: this.window,
      limit: this.max,
      remaining: Math.max(0, this.max - used),
      resetIn: (currentWindow + 1) * this.window,
      pending: Promise.resolve(),
    };
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const used = await this.client.decrby(identifier, value);
    return {
      remaining: this.max - used,
    };
  }

  public async reset(identifier: string) {
    await this.client.eval(
      resetScript,
      [identifier],
      [], // null?
    );
  }
}
