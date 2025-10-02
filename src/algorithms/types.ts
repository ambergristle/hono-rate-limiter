import type { Redis } from '@upstash/redis';
import { MaybePromise, RateLimitInfo, RateLimitResult } from "../types";

export type RedisClient = Redis;

export interface AlgorithmConstructor<T> {
  new(client: RedisClient, options: T): Algorithm;
}

export abstract class Algorithm {
  abstract readonly max: number;

  abstract check(identifier: string): MaybePromise<RateLimitInfo>;

  abstract consume(identifier: string, cost?: number): MaybePromise<RateLimitResult>;

  abstract refund(identifier: string, value: number): MaybePromise<{ remaining: number }>;

  abstract reset(identifier: string): MaybePromise<void>;
}