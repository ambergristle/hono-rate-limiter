import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, AlgorithmConstructor, RedisClient, Store } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };
import { MemoryCache } from '../../cache';
import { safeEval } from '../utils';
import { LimiterError } from '../../errors';

type IncrementArgs = [string, string, string, string];
type IncrementData = [number, number];

type SlidingWindowCounterOptions = {
  maxUnits: number;
  windowSeconds: number;
}

export class SlidingWindowCounter implements Algorithm {
  public readonly policyName: 'sliding-window';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  public readonly windowSeconds: number;

  private incrementScriptSha: Promise<string>;

  constructor(store: Store, options: SlidingWindowCounterOptions) {
    this.policyName = 'sliding-window';

    this.client = store.client;
    this.cache = store.blockedCache;

    if (options.maxUnits < 0) {
      throw new LimiterError('Max quota units must be positive integer');
    }

    this.maxUnits = options.maxUnits;

    if (options.windowSeconds < 1) {
      throw new LimiterError('Window seconds must be nonzero');
    }

    this.windowSeconds = options.windowSeconds;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  private get windowMilliseconds(): number {
    return this.windowSeconds * 1000;
  }

  static init(maxUnits: number, windowSeconds: number): AlgorithmConstructor {
    return (store) => new SlidingWindowCounter(store, {
      maxUnits,
      windowSeconds,
    });
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const currentWindow = Math.floor(Date.now() / this.windowMilliseconds);
    const currentKey = `${identifier}:${currentWindow}`;

    const count = await this.client.get<number>(currentKey) ?? 0;
    const resetAt = (currentWindow + 1) * this.windowMilliseconds;

    return {
      window: this.windowSeconds,
      limit: this.maxUnits,
      remaining: Math.max(0, this.maxUnits - count),
      resetIn: Math.ceil((resetAt - Date.now()) / 1000),
    };
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.windowSeconds,
        limit: this.maxUnits,
        remaining: 0,
        resetIn: Math.ceil((bucket.resetAt - Date.now()) / 1000),
        pending: Promise.resolve(),
      }
    }

    const currentWindow = Math.floor(now / this.windowMilliseconds);
    const currentKey = `${identifier}:${currentWindow}`;

    const previousWindow = currentWindow - 1;
    const previousKey = `${identifier}:${previousWindow}`;

    const [allowed, remaining] = await safeEval<IncrementArgs, IncrementData>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [previousKey, currentKey],
      [
        this.windowMilliseconds.toString(),
        this.maxUnits.toString(),
        cost.toString(),
        now.toString()
      ]
    );

    const resetAt = (currentWindow + 1) * this.windowMilliseconds;

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed: Boolean(allowed),
      window: this.windowSeconds,
      limit: this.maxUnits,
      remaining,
      resetIn: Math.ceil((resetAt - now) / 1000),
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string, value: number): Promise<number> {
    const count = await this.client.eval<[string], number>(
      refundScript,
      [identifier],
      [value.toString()],
    );

    return this.maxUnits - count;
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.eval(
      resetScript,
      [identifier],
      [null],
    );
  }
}
