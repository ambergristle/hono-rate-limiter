import type { Context } from 'hono';
import type { RateLimitInfo } from './types';

type RateLimitInfoV8 = RateLimitInfo & {
  policyName: string;
  identifier: string;
}

/**
 * Set rate limit response headers using specified spec
 */
export const setHeaders = async (
  c: Context,
  draft: 'draft-6' | 'draft-7' | 'draft-8',
  info: RateLimitInfoV8,
): Promise<void> => {
  switch (draft) {
    case 'draft-6': {
      return draft6(c, info);
    }
    case 'draft-7': {
      return draft7(c, info);
    }
    case 'draft-8': {
      return await draft8(c, info);
    }
    default:
      throw new Error(`Invalid draft key: ${draft}`);
  }
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-06
 */
const draft6 = (c: Context, info: RateLimitInfo): void => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  const windowSeconds = Math.ceil(info.window / 1000);
  const resetSeconds = Math.ceil(info.resetIn / 1000);

  c.header('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  c.header('RateLimit-Limit', info.limit.toString());
  c.header('RateLimit-Remaining', info.remaining.toString());
  c.header('RateLimit-Reset', resetSeconds.toString());
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-07
 */
const draft7 = (c: Context, info: RateLimitInfo): void => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  const windowSeconds = Math.ceil(info.window / 1000);
  const resetSeconds = Math.ceil(info.resetIn / 1000);

  c.header('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  c.header('RateLimit', `limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds}`);
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-08
 */
const draft8 = async (c: Context, info: RateLimitInfoV8): Promise<void> => {

  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  const windowSeconds = Math.ceil(info.window / 1000);
  const resetSeconds = Math.ceil(info.resetIn / 1000);

  const partitionKey = await getPartitionKey(info.identifier);

  const policy = `q=${info.limit}; w=${windowSeconds}; pk=:${partitionKey}:`;
  const header = `r=${info.remaining}; t=${resetSeconds}`;

  c.header('RateLimit-Policy', `"${info.policyName}"; ${policy}`)
  c.header('RateLimit', `"${info.policyName}"; ${header}`)
}

/**
 * Convert client identifier into byte sequence, as required by Draft 8.
 */
export const getPartitionKey = async (identifier: string): Promise<string> => {
  const bytes = new TextEncoder().encode(identifier);
  const hash = await crypto.subtle.digest('SHA-256', bytes);

  const buffer = Buffer.from(hash).toHex().slice(0, 12);
  return Buffer.from(buffer).toBase64();
}

/**
 * Set `Retry-After` response header
 */
const retryAfter = (
  c: Context,
  info: RateLimitInfo,
): void => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  const resetSeconds = Math.ceil(info.resetIn / 1000);

  c.header('Retry-After', resetSeconds.toString());
}