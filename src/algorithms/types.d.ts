import { MaybePromise, RateLimitInfo } from "../types";

export abstract class Algorithm {
  abstract consume(identifier: string, cost: number): MaybePromise<RateLimitInfo & {
    success: boolean;
  }>;

  abstract refund(identifier: string, value: number): MaybePromise<{ remaining: number }>;

  abstract reset(identifier: string): MaybePromise<void>;
}