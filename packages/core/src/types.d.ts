export type MaybePromise<T> = T | Promise<T>;

export type RateLimitInfo = {
  windowMilliseconds: number;
  limit: number;
  remaining: number;
  resetMilliseconds: number;
}