import type { RateLimitInfo } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import incrementScript from './increment.lua' with { type: "text" };

type IncrementArgs = [string, string, string, string, string];
type IncrementData = [number, number, number];

type TokenBucketOptions = {
  max: number;
  interval: number;
  rate: number;
}

export class TokenBucket implements Algorithm {
  private readonly client: RedisClient;

  public readonly max: number;
  private readonly interval: number;
  private readonly rate: number;

  private readonly incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: TokenBucketOptions) {
    this.client = client;

    this.max = options.max;
    this.interval = options.interval * 1000;
    this.rate = options.rate;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async consume(identifier: string, cost: number): Promise<RateLimitInfo & {
    success: boolean;
  }> {
    const now = Date.now();

    const [
      success,
      remaining,
      resetIn
    ] = await this.client.evalsha<IncrementArgs, IncrementData>(
      await this.incrementScriptSha,
      [identifier],
      [
        this.max.toString(),
        this.interval.toString(),
        this.rate.toString(),
        cost.toString(),
        now.toString(),
      ],
    );

    return {
      success: Boolean(success),
      window: this.interval,
      limit: this.max,
      remaining,
      resetIn,
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const remaining = await this.client.incrby(identifier, value);
    return {
      remaining,
    };
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }

}