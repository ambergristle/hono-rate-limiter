import type { Context, Env, MiddlewareHandler } from 'hono';
import { setHeaders } from './headers';
import { Algorithm } from './algorithms/types';

type MaybePromise<T> = T | Promise<T>;

export const rateLimiter = <
  E extends Env,
  N extends string = 'limiter',
>({
  name = 'limiter' as N,
  generateKey,
  prefix,

  algo,

  // limiter,
  headerSpec = 'draft-8',
  refundFailed,
}: {
  name?: N,
  generateKey: (c: Context<E>) => MaybePromise<string>;
  prefix?: string;

  algo: Algorithm;

  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailed?: boolean;
}): MiddlewareHandler<{ Variables: { [key in N]: any } }> => {

  return async (c, next) => {

    const segments = [await generateKey(c as any)];
    if (prefix) {
      segments.unshift(prefix);
    }

    const identifier = segments.join(':');

    const limiter = algo

    // random request id?
    // cost?
    let rateLimitInfo = await limiter.consume(identifier, cost)

    await next();

    if (c.error && refundFailed) {
      // if (consumed > 0 && refunded < consumed) {
      const { remaining } = await limiter.refund(identifier, cost);
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

// export const rateLimiter = <
//   E extends Env = Env,
//   P extends string = string,
//   I extends Input = {}
// >({
//   id,
//   cost,
//   autoLimit,
//   refundFailed,
//   generateKey,
// }: LimiterOptions<LimiterEnv<E>, P, I>): MiddlewareHandler<LimiterEnv<E>, P, I> => {
//   return async (c, next) => {
//     const identifier = `${id}:${await generateKey(c)}`;

//     let consumed = 0;
//     let refunded = 0;

//     if (autoLimit) {
//       // 
//     }

//     await next();

//     if (c.error && refundFailed) {
//       if (consumed > 0 && refunded < consumed) {
//         // await limiter.refund(key, consumed - refunded);
//       }
//     }
//   }
// }