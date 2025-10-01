import type { RateLimitInfo, RateLimitResult } from '../../types';
import { Algorithm, RedisClient } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import introspectScript from './scripts/introspect.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };

type IncrementArgs = [string, string, string];
type IncrementData = [number, number];

type SlidingWindowLogOptions = {
  max: number;
  window: number;
}

export class SlidingWindowLog implements Algorithm {
  private readonly client: RedisClient;

  public readonly max: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;
  private introspectScriptSha: Promise<string>;

  constructor(client: RedisClient, options: SlidingWindowLogOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;
    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
    this.introspectScriptSha = this.client.scriptLoad(introspectScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const now = Date.now();

    const used = await this.client.evalsha<[string, string], number>(
      await this.introspectScriptSha,
      [],
      [
        this.window.toString(),
        now.toString(),
      ]
    );

    return {
      window: this.window,
      limit: this.max,
      remaining: Math.max(0, this.max - used),
      resetIn: this.window,
    };
  }

  public async consume(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();

    const [allowed, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.window.toString(),
        now.toString(),
      ]
    );

    return {
      allowed: Boolean(allowed),
      window: this.window,
      limit: this.max,
      remaining,
      resetIn: this.window,
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const count = await this.client.eval<[], number>(
      refundScript,
      [identifier],
      [], // null?
    );

    return {
      remaining: this.max - count,
    }
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }
}