import { BlockedCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import { safeEval } from '../utils';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };

type IncrementArgs = [string, string, string, string, string];
type IncrementData = [number, number, number];

type TokenBucketOptions = {
  max: number;
  interval: number;
  rate: number;
  cache?: Map<string, number>;
}

export class TokenBucket implements Algorithm {
  private readonly client: RedisClient;

  private readonly cache: BlockedCache;

  public readonly max: number;
  private readonly interval: number;
  private readonly rate: number;

  private readonly incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: TokenBucketOptions) {
    this.client = client;

    const cache = options.cache instanceof Map
      ? options.cache
      : new Map();

    this.cache = new BlockedCache(cache);

    if (options.max < 0) {
      throw new LimiterError('Max quota units must be positive integer');
    }

    this.max = options.max;

    if (options.interval < 1) {
      throw new LimiterError('Refill interval seconds must be nonzero');
    }

    this.interval = options.interval * 1000;

    if (options.rate <= 0) {
      throw new LimiterError('Refill interval rate must be nonzero');
    }

    this.rate = options.rate;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {

    const bucket = await this.client.hmget<Record<string, number>>(identifier, 'tokens', 'refilled_at');

    const {
      tokens = this.max,
      refilled_at = Date.now(),
    } = bucket ?? {};

    return {
      window: this.interval,
      limit: this.max,
      remaining: tokens ?? this.max,
      resetIn: refilled_at + this.interval,
    };
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.interval,
        limit: this.max,
        remaining: 0,
        resetIn: bucket.resetAt - Date.now(),
        pending: Promise.resolve(),
      }
    }

    const [
      allowed,
      remaining,
      resetAt
    ] = await safeEval<IncrementArgs, IncrementData>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [identifier],
      [
        this.max.toString(),
        this.interval.toString(),
        this.rate.toString(),
        cost.toString(),
        now.toString(),
      ],
    );

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed: Boolean(allowed),
      window: this.interval,
      limit: this.max,
      remaining,
      resetIn: resetAt - Date.now(),
      pending: Promise.resolve(),
    };
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const remaining = await this.client.eval<[string, string], number>(
      refundScript,
      [identifier],
      [
        this.max.toString(),
        value.toString(),
      ]
    );

    return {
      remaining,
    };
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }

}