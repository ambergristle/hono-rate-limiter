import type { Algorithm, AlgorithmConstructor, RedisClient } from './algorithms/types';
import { LimiterError } from './errors';
import type { RateLimitInfo, RateLimitResult } from './types';

export class Limiter<T> {
  private readonly limiter: Algorithm;

  constructor(client: RedisClient, Algo: AlgorithmConstructor<T>, options: T) {
    this.limiter = new Algo(client, options);
  }

  public async check(identifier: string): Promise<RateLimitInfo> {
    try {
      return await this.limiter.check(identifier);
    } catch (cause) {
      throw new LimiterError('Rate Limit check failed', { cause });
    }
  }

  public async consume(identifier: string, cost: number): Promise<RateLimitResult> {
    try {
      return await this.limiter.consume(identifier, cost);
    } catch (cause) {
      throw new LimiterError('Rate Limit consume failed', { cause });
    }
  }

  public async refund(identifier: string, value: number): Promise<Pick<RateLimitInfo, 'remaining'>> {
    try {
      return await this.limiter.refund(identifier, value);
    } catch (cause) {
      throw new LimiterError('Rate Limit refund failed', { cause });
    }
  }

  public async reset(identifier: string): Promise<void> {
    try {
      return await this.limiter.reset(identifier);
    } catch (cause) {
      throw new LimiterError('Rate Limit reset failed', { cause });
    }
  }
}
