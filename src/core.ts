import type { Context, Env, MiddlewareHandler } from 'hono';
import { setHeaders } from './headers';
import { StoreAdapter } from './store/store';

type MaybePromise<T> = T | Promise<T>;

export const rateLimiter = <
  E extends Env,
  N extends string = 'limiter',
>({
  name = 'limiter' as N,
  generateKey,
  prefix,
  // limiter,
  headerSpec = 'draft-8',
  refundFailed,
  store,
}: {
  name?: N,
  generateKey: (c: Context<E>) => MaybePromise<string>;
  prefix?: string;
  /** @default 'draft-8' */
  headerSpec?: 'draft-6' | 'draft-7' | 'draft-8';
  refundFailed?: boolean;
  algorithm: any;
  store: (c: Context<E>) => MaybePromise<StoreAdapter> | StoreAdapter;
}): MiddlewareHandler<{ Variables: { [key in N]: any } }> => {

  return async (c, next) => {

    const segments = [await generateKey(c as any)];
    if (prefix) {
      segments.unshift(prefix);
    }

    const identifier = segments.join(':');

    // random request id?
    // cost?
    let rateLimitInfo = await limiter.consume(identifier)

    await next();

    if (c.error && refundFailed) {
      // if (consumed > 0 && refunded < consumed) {
      //   await limiter.refund(key, consumed - refunded);
      // }

      // cost?
      rateLimitInfo = await limiter.refund(result.key);
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