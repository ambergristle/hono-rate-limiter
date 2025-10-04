import type { Algorithm, AlgorithmConstructor, RedisClient } from './algorithms/types';
import { LimiterError } from './errors';
import type { RateLimitInfo, RateLimitResult } from './types';
import { MemoryCache } from './cache';


type RateLimiterOptions = {
  client: RedisClient;
  algorithm: AlgorithmConstructor;
  blockedCache?: Map<string, number>;
  keyPrefix?: string;
  policyName?: string;
}

export class RateLimiter {
  private readonly limiter: Algorithm;
  private readonly policyName: string;

  private readonly keyPrefix?: string;

  constructor(options: RateLimiterOptions) {
    // options.client.ping()

    this.limiter = options.algorithm({
      client: options.client,
      blockedCache: new MemoryCache(options.blockedCache ?? new Map()),
    });

    this.policyName = options.policyName ?? this.limiter.policyName;

    this.keyPrefix = options.keyPrefix;
  }

  private prefix(identifier: string): string {
    const parts = [this.policyName, identifier];
    if (this.keyPrefix) {
      parts.unshift(this.keyPrefix)
    }

    return parts.join(':');
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    try {
      return await this.limiter.check(this.prefix(identifier));
    } catch (cause) {
      throw new LimiterError('Rate Limit check failed', { cause });
    }
  }

  public async consume(identifier: string, cost = 1): Promise<RateLimitResult> {
    try {
      return await this.limiter.consume(this.prefix(identifier), Math.max(0, cost));
    } catch (cause) {
      throw new LimiterError('Rate Limit consume failed', { cause });
    }
  }

  public async refund(identifier: string, value: number): Promise<number> {
    try {
      return await this.limiter.refund(this.prefix(identifier), Math.min(0, value));
    } catch (cause) {
      throw new LimiterError('Rate Limit refund failed', { cause });
    }
  }

  public async reset(identifier: string): Promise<void> {
    try {
      return await this.limiter.reset(this.prefix(identifier));
    } catch (cause) {
      throw new LimiterError('Rate Limit reset failed', { cause });
    }
  }

  // public async resetAll(): Promise<void> {
  //   try {
  //     const pattern = this.keyPrefix
  //       ? `${this.keyPrefix}:${this.policyName}`
  //       : this.policyName;

  //     // search and delete
  //   } catch (cause) {
  //     throw new LimiterError('Rate Limit reset failed', { cause });
  //   }
  // }
}
