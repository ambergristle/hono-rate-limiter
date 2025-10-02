import type { Context } from 'hono';
import type { RateLimitResult } from './types';
import { LimiterError } from './errors';

type RateLimitInfoV8 = RateLimitResult & {
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
      throw new LimiterError('Invalid header spec draft');
  }
}

export const supportedDrafts = () => {
  return [6, 7, 8].map((d) => `draft-${d}`);
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-06
 */
const draft6 = (c: Context, info: RateLimitResult): void => {
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

  if (!info.allowed) {
    c.header('Retry-After', resetSeconds.toString());
  }
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-07
 */
const draft7 = (c: Context, info: RateLimitResult): void => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  const windowSeconds = Math.ceil(info.window / 1000);
  const resetSeconds = Math.ceil(info.resetIn / 1000);

  c.header('RateLimit-Policy', `${info.limit};w=${windowSeconds}`);
  c.header('RateLimit', `limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds}`);

  if (!info.allowed) {
    c.header('Retry-After', resetSeconds.toString());
  }
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

  if (!info.allowed) {
    c.header('Retry-After', resetSeconds.toString());
  }
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
