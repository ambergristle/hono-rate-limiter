export type MaybePromise<T> = T | Promise<T>;

export type RateLimitInfo = {
  window: number;
  limit: number;
  remaining: number;
  resetIn: number;
  pending: Promise<void>;
}