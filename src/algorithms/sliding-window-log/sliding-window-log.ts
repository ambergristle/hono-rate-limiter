import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { RateLimitInfo, RateLimitResult } from '../../types';
import type { Algorithm, AlgorithmConstructor, RedisClient, Store } from '../types';
import { safeEval } from '../utils';
import incrementScript from './scripts/increment.lua' with { type: "text" };
import introspectScript from './scripts/introspect.lua' with { type: "text" };
import refundScript from './scripts/refund.lua' with { type: "text" };

type IncrementArgs = [string, string, string];
type IncrementData = [number, number];

type SlidingWindowLogOptions = {
  maxUnits: number;
  windowSeconds: number;
}

export class SlidingWindowLog implements Algorithm {
  public readonly policyName: 'sliding-window-log';

  private readonly client: RedisClient;
  private readonly cache: MemoryCache;

  public readonly maxUnits: number;
  public readonly windowSeconds: number;

  private incrementScriptSha: Promise<string>;
  private introspectScriptSha: Promise<string>;

  constructor(store: Store, options: SlidingWindowLogOptions) {
    this.policyName = 'sliding-window-log';

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
    this.introspectScriptSha = this.client.scriptLoad(introspectScript);
  }

  private get windowMilliseconds(): number {
    return this.windowSeconds * 1000;
  }

  static init(maxUnits: number, windowSeconds: number): AlgorithmConstructor {
    return (store) => new SlidingWindowLog(store, {
      maxUnits,
      windowSeconds,
    });
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    const now = Date.now();

    const count = await this.client.evalsha<[string, string], number>(
      await this.introspectScriptSha,
      [identifier],
      [
        this.windowMilliseconds.toString(),
        now.toString(),
      ]
    );

    return {
      policyName: this.policyName,
      identifier,
      windowSeconds: this.windowSeconds,
      maxUnits: this.maxUnits,
      remainingUnits: Math.max(0, this.maxUnits - count),
      resetInSeconds: this.windowSeconds,
    };
  }

  public async consume(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();

    const bucket = this.cache.isBlocked(identifier);
    if (bucket.blocked) {
      return {
        allowed: false,
        policyName: this.policyName,
        identifier,
        windowSeconds: this.windowSeconds,
        maxUnits: this.maxUnits,
        remainingUnits: 0,
        resetInSeconds: Math.ceil((bucket.resetAt - now) / 1000),
        pending: Promise.resolve(),
      }
    }

    const [allowed, remainingUnits] = await safeEval<IncrementArgs, IncrementData>(
      this.client,
      {
        hash: await this.incrementScriptSha,
        script: incrementScript,
      },
      [identifier],
      [
        this.maxUnits.toString(),
        this.windowMilliseconds.toString(),
        now.toString(),
      ],
    );

    if (!allowed) {
      this.cache.blockUntil(identifier, Date.now() + this.windowMilliseconds);
    }

    return {
      allowed: Boolean(allowed),
      policyName: this.policyName,
      identifier,
      windowSeconds: this.windowSeconds,
      maxUnits: this.maxUnits,
      remainingUnits,
      resetInSeconds: this.windowSeconds,
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