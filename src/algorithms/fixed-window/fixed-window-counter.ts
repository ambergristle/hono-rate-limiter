import { BlockedCache } from '../../cache';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, RedisClient } from '../types';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import resetScript from './scripts/reset.lua' with { type: "text" };

type FixedWindowCounterOptions = {
  max: number;
  window: number;
  cache?: Map<string, number>;
}

export class FixedWindowCounter implements Algorithm {
  private readonly client: RedisClient;

  private readonly cache: BlockedCache;

  public readonly max: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;

  constructor(client: RedisClient, options: FixedWindowCounterOptions) {
    this.client = client;

    const cache = options.cache instanceof Map
      ? options.cache
      : new Map();

    this.cache = new BlockedCache(cache);

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
    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.window,
        limit: this.max,
        remaining: 0,
        resetIn: bucket.resetAt - Date.now(),
        pending: Promise.resolve(),
      }
    }

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

    const allowed = used <= this.max;
    const resetAt = (currentWindow + 1) * this.window;

    if (!allowed) {
      this.cache.blockUntil(identifier, resetAt);
    }

    return {
      allowed,
      window: this.window,
      limit: this.max,
      remaining: Math.max(0, this.max - used),
      resetIn: resetAt - Date.now(),
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
