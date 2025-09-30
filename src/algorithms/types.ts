import type { Redis } from '@upstash/redis';
import { MaybePromise, RateLimitInfo } from "../types";

export type RedisClient = Redis;

export abstract class Algorithm {
  abstract readonly max: number;

  abstract consume(identifier: string, cost: number): MaybePromise<RateLimitInfo & {
    success: boolean;
  }>;

  abstract refund(identifier: string, value: number): MaybePromise<{ remaining: number }>;

  abstract reset(identifier: string): MaybePromise<void>;
}