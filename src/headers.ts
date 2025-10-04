import type { Context } from 'hono';
import type { HeaderSpec, LimiterEnv, MaybePromise, RateLimitResult } from './types';
import { LimiterError } from './errors';

/**
 * Set rate limit response headers using specified spec
 */
export const setHeaders = async (
  c: Context<LimiterEnv>,
  limiterId: string,
  draft: HeaderSpec,
  info: RateLimitResult,
): Promise<void> => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be set');
    return;
  };

  let headerSpec = draft;

  const appliedLimit = c.var.limit;
  if (appliedLimit && draft !== appliedLimit.headerSpec) {
    headerSpec = appliedLimit.headerSpec;
  }

  const spec = specs[headerSpec];
  if (!spec) {
    throw new LimiterError('Invalid header spec draft');
  }

  const policy = await spec.policy(info);
  c.header('RateLimit-Policy', policy, { append: true });

  if (info.allowed) {
    const consumed = info.maxUnits
      ? info.remainingUnits / info.maxUnits
      : Infinity;

    if (appliedLimit && consumed > appliedLimit.consumed) {
      return;
    }

    c.set('limit', {
      limiterId,
      headerSpec,
      consumed,
      ...info,
    });
  }

  const infoHeaders = spec.info(info);
  infoHeaders.forEach(([name, value]) => {
    c.header(name, value);
  });

  if (!info.allowed) {
    c.header('Retry-After', info.resetInSeconds.toString());
  }

}

export const updateInfoHeaders = async (
  c: Context<LimiterEnv>,
  limiterId: string,
  remainingUnits: number,
) => {
  if (c.finalized) {
    console.warn('Context finalized before RateLimit headers could be updated');
    return;
  };

  const appliedLimit = c.var.limit;
  if (!appliedLimit || limiterId !== appliedLimit.limiterId) {
    return;
  }

  const spec = specs[appliedLimit.headerSpec];
  if (!spec) {
    throw new LimiterError('Invalid header spec draft');
  }

  const infoHeaders = spec.info({
    ...appliedLimit,
    remainingUnits,
  });

  infoHeaders.forEach(([name, value]) => {
    c.header(name, value);
  });
}

const specs: {
  [key in HeaderSpec]: {
    policy: (info: RateLimitResult) => MaybePromise<string>;
    info: (info: RateLimitResult) => [string, string][];
  }
} = {
  /**
   * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-06
   */
  'draft-6': {
    policy: (info) => `${info.maxUnits};w=${info.windowSeconds}`,
    info: (info) => [
      ['RateLimit-Limit', info.maxUnits.toString()],
      ['RateLimit-Remaining', info.remainingUnits.toString()],
      ['RateLimit-Reset', info.resetInSeconds.toString()]
    ],
  },
  /**
   * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-07
   */
  'draft-7': {
    policy: (info) => `${info.maxUnits};w=${info.windowSeconds}`,
    info: (info) => [
      ['RateLimit', `limit=${info.maxUnits}, remaining=${info.remainingUnits}, reset=${info.resetInSeconds}`],
    ],
  },
  /**
   * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-08
   */
  'draft-8': {
    policy: async (info) => {
      // ends in==?
      const partitionKey = await getPartitionKey(info.identifier);
      const policy = `q=${info.maxUnits};w=${info.windowSeconds};pk=:${partitionKey}:`;
      return `"${info.policyName}";${policy}`;
    },
    info: (info) => {
      const header = `r=${info.remainingUnits};t=${info.resetInSeconds}`;
      return [
        ['RateLimit', `"${info.policyName}";${header}`],
      ]
    }
  },
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
