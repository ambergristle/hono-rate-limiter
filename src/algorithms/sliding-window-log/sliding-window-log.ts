import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import { Algorithm, RedisClient, Store } from '../types';
import { safeEval } from '../utils';
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
  public readonly policyName: 'sliding-window-log';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  public readonly window: number;

  private incrementScriptSha: Promise<string>;
  private introspectScriptSha: Promise<string>;

  constructor(store: Store, options: SlidingWindowLogOptions) {
    this.policyName = 'sliding-window-log';

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
    this.introspectScriptSha = this.client.scriptLoad(introspectScript);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const now = Date.now();

    const used = await this.client.evalsha<[string, string], number>(
      await this.introspectScriptSha,
      [identifier],
      [
        this.window.toString(),
        now.toString(),
      ]
    );

    return {
      window: this.window,
      limit: this.maxUnits,
      remaining: Math.max(0, this.maxUnits - used),
      resetIn: this.window,
    };
  }

  public async consume(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        window: this.window,
        limit: this.maxUnits,
        remaining: 0,
        resetIn: bucket.resetAt - now,
        pending: Promise.resolve(),
      }
    }

    const [allowed, remaining] = await safeEval<IncrementArgs, IncrementData>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [identifier],
      [
        this.maxUnits.toString(),
        this.window.toString(),
        now.toString(),
      ],
    );

    if (!allowed) {
      this.cache.blockUntil(identifier, Date.now() + this.window);
    }

    return {
      allowed: Boolean(allowed),
      window: this.window,
      limit: this.maxUnits,
      remaining,
      resetIn: this.window,
      pending: Promise.resolve(),
    }
  }

  public async refund(identifier: string): Promise<number> {
    const count = await this.client.eval<[], number>(
      refundScript,
      [identifier],
      [], // null?
    );

    return this.maxUnits - count;
  }

  public async reset(identifier: string): Promise<void> {
    await this.client.del(identifier);
  }
}