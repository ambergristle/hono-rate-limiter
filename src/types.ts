export type MaybePromise<T> = T | Promise<T>;

export type RateLimitInfo = {
  window: number;
  limit: number;
  remaining: number;
  resetIn: number;
}

export type RateLimitResult = RateLimitInfo & {
  allowed: boolean;
  pending: Promise<void>;
}