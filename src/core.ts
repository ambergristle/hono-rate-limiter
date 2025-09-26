import type { Context, Env, MiddlewareHandler } from 'hono';
import { setHeaders } from './headers';
import { Algorithm } from './algorithms/types';
import { MaybePromise } from './types';

type RateLimiterOptions<E extends Env, N extends string> = {
  name?: N,
  generateKey: (c: Context<E>) => MaybePromise<string>;
  prefix?: string;

  algo: Algorithm | ((c: Context<E>) => MaybePromise<Algorithm>);
  cost?: number;

  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailed?: boolean;
}

export const rateLimiter = <
  E extends Env,
  N extends string = 'limiter',
>({
  name = 'limiter' as N,
  generateKey,
  prefix = 'limit',

  algo,
  cost = 1,

  headerSpec = 'draft-8',
  refundFailed,
}: RateLimiterOptions<E, N>): MiddlewareHandler<{
  Variables: { [key in N]: any }
}> => {

  return async (c, next) => {
    const identifier = `${prefix}:${await generateKey(c as any)}`;

    const limiter = typeof algo === 'function'
      ? await algo(c as any)
      : algo

    const rateLimitInfo = await limiter.consume(identifier, cost)

    await next();

    if (c.error && refundFailed) {
      const { remaining } = await limiter.refund(identifier, cost);
      rateLimitInfo.remaining = remaining;
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
