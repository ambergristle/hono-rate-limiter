import type { Context, Env, MiddlewareHandler } from 'hono';
import type { Algorithm } from './algorithms/types';
import { setHeaders } from './headers';
import { MaybePromise } from './types';

type RateLimiterOptions<E extends Env, N extends string> = {
  /** @default 'limiter' */
  name?: N,
  algo: Algorithm | ((c: Context<E>) => MaybePromise<Algorithm>);
  /** @default 1 */
  cost?: number;
  generateKey: (c: Context<E>) => MaybePromise<string>;
  /** @default 'limit' */
  prefix?: string;
  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailed?: boolean;
}

export const rateLimiter = <
  E extends Env,
  N extends string = 'limiter',
>({
  name = 'limiter' as N,
  algo,
  cost = 1,
  generateKey,
  prefix = 'limit',
  headerSpec = 'draft-8',
  refundFailed,
}: RateLimiterOptions<E, N>): MiddlewareHandler<{
  Variables: { [key in N]: any }
}> => {

  return async (c, next) => {
    const identifier = `${prefix}:${await generateKey(c as any)}`;

    const limiter = typeof algo === 'function'
      ? await algo(c as any)
      : algo;

    const rateLimitInfo = await limiter.consume(identifier, cost);
    if (rateLimitInfo.success) {
      await next();

      if (c.error && refundFailed) {
        const { remaining } = await limiter.refund(identifier, cost);
        rateLimitInfo.remaining = remaining;
      }
    }

    if (headerSpec) {
      setHeaders(c, headerSpec, {
        policyName: name,
        identifier,
        ...rateLimitInfo
      })
    }
  }
};
