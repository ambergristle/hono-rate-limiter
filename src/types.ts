
export type MaybePromise<T> = T | Promise<T>;

export type RateLimitInfo = {
  policyName: string;
  identifier: string;
  windowSeconds: number;
  maxUnits: number;
  remainingUnits: number;
  resetInSeconds: number;
}

export type RateLimitResult = RateLimitInfo & {
  allowed: boolean;
  pending: Promise<void>;
}

export type HeaderSpec = 'draft-6' | 'draft-7' | 'draft-8';

export type LimiterEnv = {
  Variables: {
    limit?: {
      limiterId: string;
      headerSpec: HeaderSpec;
      consumed: number;
    } & RateLimitResult;
  }
}