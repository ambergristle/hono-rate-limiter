import { beforeEach, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { getPartitionKey, setHeaders, updateInfoHeaders } from '../src/headers';
import { LimiterEnv } from './types';

let app: Hono<LimiterEnv>;
beforeEach(() => {
  app = new Hono<LimiterEnv>()
});

const info = {
  allowed: true,
  policyName: 'basic',
  identifier: 'test-id',
  windowSeconds: 1000,
  maxUnits: 100,
  remainingUnits: 100,
  resetInSeconds: 1000,
  pending: Promise.resolve(),
};

test('sets draft-6 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-6', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('RateLimit-Policy')).toBe(`${info.maxUnits};w=${info.windowSeconds}`);

  expect(headers.get('RateLimit-Limit')).toBe(`${info.maxUnits}`);
  expect(headers.get('RateLimit-Remaining')).toBe(`${info.remainingUnits}`);
  expect(headers.get('RateLimit-Reset')).toBe(`${info.resetInSeconds}`);
});

test('sets draft-7 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-7', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('RateLimit-Policy')).toBe(`${info.maxUnits};w=${info.windowSeconds}`);

  expect(headers.get('RateLimit'))
    .toBe(`limit=${info.maxUnits}, remaining=${info.remainingUnits}, reset=${info.resetInSeconds}`);
});

test('sets draft-8 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-8', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const partitionKey = await getPartitionKey(info.identifier);
  const policy = `q=${info.maxUnits};w=${info.windowSeconds};pk=:${partitionKey}:`;
  expect(headers.get('RateLimit-Policy')).toBe(`"${info.policyName}";${policy}`);

  const header = `r=${info.remainingUnits};t=${info.resetInSeconds}`;
  expect(headers.get('RateLimit')).toBe(`"${info.policyName}";${header}`);
});

test('sets retry-after header on blocked requests', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-8', {
      ...info,
      allowed: false,
    });
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('Retry-After')).toBe(info.resetInSeconds.toString());

});

test('falls back to first-set draft', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-6', info);
    await setHeaders(c, crypto.randomUUID(), 'draft-8', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const policy = headers.get('RateLimit-Policy');
  expect(policy).toBeString();

  const policies = policy?.split(', ') ?? '';
  expect(policies.length).toBe(2);

  // draft-6 spec
  expect(policies[0]).toBe(`${info.maxUnits};w=${info.windowSeconds}`);
  expect(headers.get('RateLimit-Remaining')).toBe(`${info.remainingUnits}`);
});

test('only overwrites info headers if closer to limit', async () => {
  const REMAINING = 60;

  app.get('/', async (c) => {
    await setHeaders(c, crypto.randomUUID(), 'draft-6', {
      ...info,
      remainingUnits: 70,
    });

    await setHeaders(c, crypto.randomUUID(), 'draft-6', {
      ...info,
      remainingUnits: REMAINING,
    });

    await setHeaders(c, crypto.randomUUID(), 'draft-6', {
      ...info,
      remainingUnits: 80,
    });

    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const policy = headers.get('RateLimit-Policy');
  expect(policy).toBeString();

  const policies = policy?.split(', ') ?? '';
  expect(policies.length).toBe(3);

  expect(headers.get('RateLimit-Remaining')).toBe(REMAINING.toString());

});

test('updates info headers after refund', async () => {
  const REMAINING = 90;

  app.get('/', async (c) => {
    const limiterId = crypto.randomUUID();

    await setHeaders(c, limiterId, 'draft-6', {
      ...info,
      remainingUnits: 80,
    });

    // ... refund

    await updateInfoHeaders(c, limiterId, REMAINING);

    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('RateLimit-Remaining')).toBe(REMAINING.toString());
});

test('doesnt update info headers if farther from limit', async () => {
  const REMAINING = 70;

  app.get('/', async (c) => {
    const limiterAId = crypto.randomUUID();
    const limiterBId = crypto.randomUUID();

    await setHeaders(c, limiterAId, 'draft-6', {
      ...info,
      remainingUnits: 80,
    });

    await setHeaders(c, limiterBId, 'draft-6', {
      ...info,
      remainingUnits: 60,
    });

    // ... refund

    await updateInfoHeaders(c, limiterBId, REMAINING);

    await updateInfoHeaders(c, limiterAId, 90);

    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('RateLimit-Remaining')).toBe(REMAINING.toString());
});
