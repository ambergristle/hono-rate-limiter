import type { RateLimitInfo } from '../../types';
import { Algorithm, RedisClient } from '../types';
import incrementScript from './increment.lua' with { type: "text" };
import refundScript from './refund.lua' with { type: "text" };

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

  constructor(client: RedisClient, options: SlidingWindowLogOptions) {
    this.client = client;

    this.max = options.max;
    this.window = options.window * 1000;
    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async consume(identifier: string): Promise<RateLimitInfo & {
    success: boolean;
  }> {
    const now = Date.now();

    const [success, remaining] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.window.toString(),
        now.toString(),
      ]
    );

    return {
      success: Boolean(success),
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