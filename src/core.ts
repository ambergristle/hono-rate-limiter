import type { Context, Env, MiddlewareHandler } from 'hono';
import type { Algorithm } from './algorithms/types';
import { setHeaders, updateInfoHeaders } from './headers';
import { LimiterEnv, MaybePromise } from './types';
import { RateLimiter } from './limiter';
import { LimiterError } from './errors';

type RateLimiterOptions<
  E extends Env,
  R extends Response
> = {
  limiter: RateLimiter | ((c: Context<E>) => MaybePromise<RateLimiter>);
  /** @default 1 */
  cost?: number;
  generateKey: (c: Context<E>) => MaybePromise<string>;
  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailedRequests?: boolean;
  errorResponse?: (c: Context) => R;
}

export const rateLimiter = <
  E extends Env,
  R extends Response = Response,
>(options: RateLimiterOptions<E, R>): MiddlewareHandler<LimiterEnv> => {

  const {
    limiter: getLimiter,
    cost = 1,
    generateKey,
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
    const identifier = await generateKey(c as any);

    const limiter = typeof getLimiter === 'function'
      ? await getLimiter(c as any)
      : getLimiter;

    const rateLimitInfo = await limiter.consume(identifier, cost);

    const limiterId = crypto.randomUUID();
    if (headerSpec) {
      await setHeaders(c, limiterId, headerSpec, rateLimitInfo);
    }

    if (!rateLimitInfo.allowed) {
      return _errorResponse(c);
    }

    await next();

    const requestFailed = c.res.status > 400;
    if (requestFailed && refundFailedRequests) {
      const remainingUnits = await limiter.refund(identifier, cost);
      if (headerSpec) {
        await updateInfoHeaders(c, limiterId, remainingUnits);
      }
    }
  }
};
