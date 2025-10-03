import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient, Store } from '../types';
import { safeEval } from '../utils';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };

type IncrementArgs = [string, string, string, string, string];
type IncrementData = [number, number, number];

type TokenBucketOptions = {
  maxUnits: number;
  intervalSeconds: number;
  refillRate: number;
}

export class TokenBucket implements Algorithm {
  public readonly policyName: 'token-bucket';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  private readonly intervalSeconds: number;
  private readonly refillRate: number;

  private readonly incrementScriptSha: Promise<string>;

  constructor(store: Store, options: TokenBucketOptions) {
    this.policyName = 'token-bucket';

    this.client = store.client;
    this.cache = store.blockedCache;

    if (options.maxUnits < 0) {
      throw new LimiterError('Max quota units must be positive integer');
    }

    this.maxUnits = options.maxUnits;

    if (options.intervalSeconds < 1) {
      throw new LimiterError('Refill interval seconds must be nonzero');
    }

    this.intervalSeconds = options.intervalSeconds;

    if (options.refillRate <= 0) {
      throw new LimiterError('Refill interval rate must be nonzero');
    }

    this.refillRate = options.refillRate;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  private get intervalMilliseconds(): number {
    return this.intervalSeconds * 1000;
  }

  public async check(identifier: string): Promise<RateLimitInfo> {

    const bucket = await this.client.hmget<Record<string, number>>(identifier, 'tokens', 'refilled_at');

    const {
      tokens = this.maxUnits,
      refilled_at = Date.now(),
    } = bucket ?? {};

    const resetAt = refilled_at + this.intervalMilliseconds;

    return {
      policyName: this.policyName,
      identifier,
      windowSeconds: this.intervalSeconds,
      maxUnits: this.maxUnits,
      remainingUnits: tokens ?? this.maxUnits,
      resetInSeconds: Math.ceil((resetAt - Date.now()) / 1000),
    };
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        policyName: this.policyName,
        identifier,
        windowSeconds: this.intervalSeconds,
        maxUnits: this.maxUnits,
        remainingUnits: 0,
        resetInSeconds: Math.ceil((bucket.resetAt - Date.now()) / 1000),
        pending: Promise.resolve(),
      }
    }

    const [
      allowed,
      remainingUnits,
      resetAt
    ] = await safeEval<IncrementArgs, IncrementData>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [identifier],
      [
        this.maxUnits.toString(),
        this.intervalMilliseconds.toString(),
        this.refillRate.toString(),
        cost.toString(),
        now.toString(),
      ],
    );

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed: Boolean(allowed),
      policyName: this.policyName,
      identifier,
      windowSeconds: this.intervalSeconds,
      maxUnits: this.maxUnits,
      remainingUnits,
      resetInSeconds: Math.ceil((resetAt - Date.now()) / 1000),
      pending: Promise.resolve(),
    };
  }

  public async refund(identifier: string, value: number): Promise<number> {
    const remaining = await this.client.eval<[string, string], number>(
      refundScript,
      [identifier],
      [
        this.maxUnits.toString(),
        value.toString(),
      ]
    );

    return remaining;
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }

}