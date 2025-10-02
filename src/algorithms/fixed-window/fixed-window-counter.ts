import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient, Store } from '../types';
import { safeEval } from '../utils';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };

type FixedWindowCounterOptions = {
  max: number;
  window: number;
}

export class FixedWindowCounter implements Algorithm {
  public readonly policyName: 'fixed-window';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(store: Store, options: FixedWindowCounterOptions) {
    this.policyName = 'fixed-window';

    this.client = store.client;
    this.cache = store.blockedCache;

    if (options.max < 0) {
      throw new LimiterError('Max quota units must be positive integer');
    }

    this.maxUnits = options.max;

    if (options.window < 1) {
      throw new LimiterError('Window seconds must be nonzero');
    }

    this.window = options.window * 1000;

    this.incrementScriptSha = this.client.scriptLoad(incrementScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await this.client.get<number>(key) ?? 0;

    return {
      window: this.window,
      limit: this.maxUnits,
      remaining: Math.max(0, this.maxUnits - used),
      resetIn: (currentWindow + 1) * this.window,
    };
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.window,
        limit: this.maxUnits,
        remaining: 0,
        resetIn: bucket.resetAt - Date.now(),
        pending: Promise.resolve(),
      }
    }

    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await safeEval<[string, string], number>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [key],
      [
        this.window.toString(),
        cost.toString(),
      ],
    );

    const allowed = used <= this.maxUnits;
    const resetAt = (currentWindow + 1) * this.window;

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed,
      window: this.window,
      limit: this.maxUnits,
      remaining: Math.max(0, this.maxUnits - used),
      resetIn: resetAt - Date.now(),
      pending: Promise.resolve(),
    };
  }

  public async refund(identifier: string, value: number): Promise<number> {

    const currentWindow = Math.floor(Date.now() / this.window);
    const key = [identifier, currentWindow].join(":");

    const used = await this.client.eval<[string], number>(
      refundScript,
      [key],
      [value.toString()],
    );

    return this.maxUnits - used;
  }

  public async reset(identifier: string) {
    await this.client.eval(
      resetScript,
      [identifier],
      [null],
    );
  }

}
