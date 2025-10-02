import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };
import { BlockedCache } from '../../cache';
import { safeEval } from '../utils';
import { LimiterError } from '../../errors';

type IncrementArgs = [string, string, string, string];
type IncrementData = [number, number];

type SlidingWindowCounterOptions = {
  max: number;
  window: number;
  cache?: Map<string, number>;
}

export class SlidingWindowCounter implements Algorithm {
  private readonly client: RedisClient;

  private readonly cache: BlockedCache;

  public readonly max: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: SlidingWindowCounterOptions) {
    this.client = client;

    const cache = options.cache instanceof Map
      ? options.cache
      : new Map();

    this.cache = new BlockedCache(cache);

    if (options.max < 0) {
      throw new LimiterError('Max quota units must be positive integer');
    }

    this.max = options.max;

    if (options.window < 1) {
      throw new LimiterError('Window seconds must be nonzero');
    }

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

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.window,
        limit: this.max,
        remaining: 0,
        resetIn: bucket.resetAt - now,
        pending: Promise.resolve(),
      }
    }

    const currentWindow = Math.floor(now / this.window);
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
        this.window.toString(),
        this.max.toString(),
        cost.toString(),
        now.toString()
      ]
    );

    const resetAt = (currentWindow + 1) * this.window;

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed: Boolean(allowed),
      window: this.window,
      limit: this.max,
      remaining,
      resetIn: resetAt - Date.now(),
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    const used = await this.client.eval<[string], number>(
      refundScript,
      [identifier],
      [value.toString()],
    );

    if (used === -1) {
      throw new LimiterError('Invalid identifier', {
        cause: { identifier },
      })
    }

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
