import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient, Store } from '../types';
import { safeEval } from '../utils';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };

type FixedWindowCounterOptions = {
  maxUnits: number;
  windowSeconds: number;
}

export class FixedWindowCounter implements Algorithm {
  public readonly policyName: 'fixed-window';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  public readonly windowSeconds: number;

  private incrementScriptSha: Promise<string>;

  constructor(store: Store, options: FixedWindowCounterOptions) {
    this.policyName = 'fixed-window';

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

  public async check(identifier: string): Promise<RateLimitInfo> {
    const currentWindow = Math.floor(Date.now() / this.windowMilliseconds);
    const key = [identifier, currentWindow].join(":");

    const count = await this.client.get<number>(key) ?? 0;
    const resetAt = (currentWindow + 1) * this.windowMilliseconds;

    return {
      policyName: this.policyName,
      identifier,
      windowSeconds: this.windowSeconds,
      maxUnits: this.maxUnits,
      remainingUnits: Math.max(0, this.maxUnits - count),
      resetInSeconds: Math.ceil((resetAt - Date.now()) / 1000),
    };
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        policyName: this.policyName,
        identifier,
        windowSeconds: this.windowSeconds,
        maxUnits: this.maxUnits,
        remainingUnits: 0,
        resetInSeconds: Math.ceil((bucket.resetAt - Date.now()) / 1000),
        pending: Promise.resolve(),
      }
    }

    const currentWindow = Math.floor(Date.now() / this.windowMilliseconds);
    const key = [identifier, currentWindow].join(":");

    const count = await safeEval<[string, string], number>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [key],
      [
        this.windowMilliseconds.toString(),
        cost.toString(),
      ],
    );

    const allowed = count <= this.maxUnits;
    const resetAt = (currentWindow + 1) * this.windowMilliseconds;

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed,
      policyName: this.policyName,
      identifier,
      windowSeconds: this.windowSeconds,
      maxUnits: this.maxUnits,
      remainingUnits: Math.max(0, this.maxUnits - count),
      resetInSeconds: Math.ceil((resetAt - Date.now()) / 1000),
      pending: Promise.resolve(),
    };
  }

  public async refund(identifier: string, value: number): Promise<number> {

    const currentWindow = Math.floor(Date.now() / this.windowMilliseconds);
    const key = [identifier, currentWindow].join(":");

    const count = await this.client.eval<[string], number>(
      refundScript,
      [key],
      [value.toString()],
    );

    return this.maxUnits - count;
  }

  public async reset(identifier: string) {
    await this.client.eval(
      resetScript,
      [identifier],
      [null],
    );
  }

}
