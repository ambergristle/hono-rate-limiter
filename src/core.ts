import type { Context, Env, MiddlewareHandler } from 'hono';
import { Algorithm, type AlgorithmConstructor, type RedisClient } from './algorithms/types';
import { setHeaders, updateInfoHeaders } from './headers';
import type { LimiterEnv, MaybePromise } from './types';
import { RateLimiter } from './limiter';
import { LimiterError } from './errors';

type StaticOrFromContext<E extends Env, T> = T | ((c: Context<E>) => MaybePromise<T>)

type RateLimiterOptions<
  E extends Env,
  R extends Response
> = {
  // limiter: StaticOrFromContext<RateLimiter>;
  /** @default 1 */
  cost?: number | ((c: Context<E>) => number);
  generateKey: (c: Context<E>) => MaybePromise<string>;
  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailedRequests?: boolean;
  errorResponse?: (c: Context) => R;

  //
  keyPrefix?: string;
  policyName?: string;
  client: StaticOrFromContext<E, RedisClient>,
  algorithm: AlgorithmConstructor,
  blockedCache?: Map<string, number>;
}

export const rateLimiter = <
  E extends Env,
  R extends Response = Response,
>(options: RateLimiterOptions<E, R>): MiddlewareHandler<LimiterEnv> => {

  const {
    // limiter: getLimiter,
    client: getClient,
    algorithm,
    blockedCache,
    keyPrefix,
    policyName,

    cost: getCost = 1,
    generateKey,
    headerSpec = 'draft-8',
    refundFailedRequests,
    errorResponse,
  } = options;

  if (typeof getCost === 'number' && getCost < 1) {
    throw new LimiterError('Cost must be positive integer');
  }

  const _errorResponse = errorResponse ?? ((c: Context) => {
    return c.text('Too many requests', 429);
  });

  return async (c, next) => {

    const identifier = await generateKey(c as any);

    // this is all extra overhead if cient is known
    const limiter = new RateLimiter({
      client: typeof getClient === 'function' ? await getClient(c as any) : getClient,
      algorithm,
      blockedCache,
      keyPrefix,
      policyName,
    });

    const cost = typeof getCost === 'function'
      ? getCost(c as any)
      : getCost;

    // const limiter = typeof getLimiter === 'function'
    //   ? await getLimiter(c as any)
    //   : getLimiter;

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
