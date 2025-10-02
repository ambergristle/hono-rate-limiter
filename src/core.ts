import type { Context, Env, MiddlewareHandler } from 'hono';
import type { Algorithm } from './algorithms/types';
import { setHeaders } from './headers';
import { MaybePromise } from './types';
import { Limiter } from './limiter';
import { LimiterError } from './errors';

type RateLimiterOptions<
  E extends Env,
  O extends unknown,
  N extends string,
  R extends Response
> = {
  /** @default 'limiter' */
  name?: N,
  limiter: Limiter<O> | ((c: Context<E>) => MaybePromise<Limiter<O>>);
  algo: Algorithm | ((c: Context<E>) => MaybePromise<Algorithm>);
  /** @default 1 */
  cost?: number;
  generateKey: (c: Context<E>) => MaybePromise<string>;
  /** @default 'limit' */
  prefix?: string;
  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailedRequests?: boolean;
  errorResponse?: (c: Context) => R;
}

export const rateLimiter = <
  E extends Env,
  O extends unknown,
  R extends Response,
  N extends string = 'limiter',
>(options: RateLimiterOptions<E, O, N, R>): MiddlewareHandler<{
  Variables: { [key in N]: any }
}> => {

  const {
    name = 'limiter' as N,
    limiter,
    cost = 1,
    generateKey,
    prefix = 'limit',
    headerSpec = 'draft-8',
    refundFailedRequests,
    errorResponse,
  } = options;

  if (cost < 1) {
    throw new LimiterError('Cost must be positive integer');
  }

  const _errorResponse = errorResponse ?? ((c: Context) => {
    return c.text('Too many requests', 429);
  })

  return async (c, next) => {
    const identifier = `${prefix}:${await generateKey(c as any)}`;

    const _limiter = typeof limiter === 'function'
      ? await limiter(c as any)
      : limiter;

    const rateLimitInfo = await _limiter.consume(identifier, cost);

    if (!rateLimitInfo.allowed) {
      if (headerSpec) {
        setHeaders(c, headerSpec, {
          ...rateLimitInfo,
          identifier,
          policyName: name,
        });
      }

      return _errorResponse(c);
    }

    await next();

    const requestFailed = c.res.status > 400;
    if (requestFailed && refundFailedRequests) {
      const { remaining } = await _limiter.refund(identifier, cost);
      rateLimitInfo.remaining = remaining;
    }

    if (headerSpec) {
      setHeaders(c, headerSpec, {
        ...rateLimitInfo,
        identifier,
        policyName: name,
      });
    }
  }
};
