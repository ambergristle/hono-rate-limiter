import type { Redis } from '@upstash/redis';
import type { MemoryCache } from '../cache';
import type { MaybePromise, RateLimitInfo, RateLimitResult } from "../types";

export type RedisClient = Redis;

export type Store = {
  client: RedisClient;
  blockedCache: MemoryCache;
}

export type AlgorithmConstructor = (store: Store) => Algorithm;

export abstract class Algorithm {
  abstract readonly policyName: string;
  abstract readonly maxUnits: number;

  abstract check(identifier: string): MaybePromise<RateLimitInfo>;

  abstract consume(identifier: string, cost?: number): MaybePromise<RateLimitResult>;

  abstract refund(identifier: string, value: number): MaybePromise<number>;

  abstract reset(identifier: string): MaybePromise<void>;
}