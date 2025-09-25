import * as fs from 'fs';
import { LimiterAlgorithm } from '../types';
import { RateLimitInfo } from '../../types';

const INCREMENT_SCRIPT = fs.readFileSync('./increment.lua', 'utf8');

type FixedWindowOptions = {
  client: RedisAdapter;
  /** @default 1 */
  cost?: number;
  limit: number;
  windowMilliseconds: number;
}

// i expect we can just use client identifier as key
// though following pattern would mean using window/bucket
// should still prefix key
export class FixedWindowCounter implements LimiterAlgorithm {
  private readonly client: RedisAdapter;

  private readonly cost: number;
  private readonly limit: number;
  private readonly windowMilliseconds: number;

  private incrementScriptSha: Promise<string>;

  private readonly clientInfo = new Map<string, RateLimitInfo>()

  constructor(options: FixedWindowOptions) {
    this.client = options.client;

    this.cost = options.cost ?? 1;

    if (this.cost < 1) {
      throw new Error('Request cost must be >= 1');
    }

    this.limit = options.limit;
    this.windowMilliseconds = options.windowMilliseconds;

    this.incrementScriptSha = this.client.scriptLoad(INCREMENT_SCRIPT);
  }

  public getRateLimitInfo(identifier: string): RateLimitInfo {
    return this.clientInfo.get(identifier) ?? {
      windowMilliseconds: this.windowMilliseconds,
      limit: this.limit,
      remaining: this.limit,
      resetMilliseconds: this.windowMilliseconds,
    };
  }

  public resetRateLimitInfo(identifier: string): void {
    this.clientInfo.delete(identifier);
  }

  public async consume(identifier: string) {
    const now = Date.now();

    const window = Math.floor(now / this.windowMilliseconds);
    const key = [identifier, window].join(":");

    /** @todo cache check */

    // random request ID

    // can safely increment, even beyond allowed
    // assuming cost is the same for all requests using this limiter
    // since excess is excess; though may end up wasting tokens if cost > 1
    // also complicates refund? or does it?

    /**
     * 
     */
    const remaining = await this.client.evalsha<[string, string], number>(
      await this.incrementScriptSha,
      [key],
      [
        this.windowMilliseconds.toString(),
        this.cost.toString(),
      ],
    );

    const success = remaining <= this.limit;

    // prevents sub-zero remaining
    // const remainingTokens = Math.max(0, tokens - usedTokensAfterUpdate);

    // start of next bucket
    const resetMilliseconds = (window + 1) * this.windowMilliseconds;

    // update cache

    this.clientInfo.set(identifier, {
      windowMilliseconds: this.windowMilliseconds,
      limit: this.limit,
      remaining,
      resetMilliseconds,
    })

    // return {
    //   success,
    //   limit: tokens,
    //   remaining: remainingTokens,
    //   reset,
    //   pending: Promise.resolve(),
    // }

    return {
      key
    }
  }

  public async refund(key: string): Promise<number> {
    return await this.client.decrby(key, cost);
  }

  public async resetKey(identifier: string) {
    await this.client.del(key);
  }
}