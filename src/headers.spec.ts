import { beforeEach, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { getPartitionKey, setHeaders } from '../src/headers';

let app: Hono;
beforeEach(() => {
  app = new Hono()
});

const info = {
  allowed: true,
  policyName: 'basic',
  identifier: 'test-id',
  window: 1000,
  limit: 100,
  remaining: 100,
  resetIn: 1000,
  pending: Promise.resolve(),
};

test('sets draft-6 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, 'draft-6', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const windowSeconds = info.window / 1000;
  expect(headers.get('RateLimit-Policy')).toBe(`${info.limit};w=${windowSeconds}`);

  expect(headers.get('RateLimit-Limit')).toBe(`${info.limit}`);

  expect(headers.get('RateLimit-Remaining')).toBe(`${info.remaining}`);

  const resetSeconds = info.resetIn / 1000;
  expect(headers.get('RateLimit-Reset')).toBe(`${resetSeconds}`);
});

test('sets draft-7 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, 'draft-7', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const windowSeconds = info.window / 1000;
  expect(headers.get('RateLimit-Policy')).toBe(`${info.limit};w=${windowSeconds}`);

  const resetSeconds = info.resetIn / 1000;
  expect(headers.get('RateLimit'))
    .toBe(`limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds}`);
});

test('sets draft-8 headers', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, 'draft-8', info);
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  const partitionKey = await getPartitionKey(info.identifier);
  const windowSeconds = info.window / 1000;
  const policy = `q=${info.limit}; w=${windowSeconds}; pk=:${partitionKey}:`;
  expect(headers.get('RateLimit-Policy')).toBe(`"${info.policyName}"; ${policy}`);

  const resetSeconds = info.resetIn / 1000;
  const header = `r=${info.remaining}; t=${resetSeconds}`;
  expect(headers.get('RateLimit')).toBe(`"${info.policyName}"; ${header}`);
});

test('sets retry-after header on blocked requests', async () => {
  app.get('/', async (c) => {
    await setHeaders(c, 'draft-8', {
      ...info,
      allowed: false,
    });
    return c.body(null, 200);
  });

  const { headers } = await app.request('/');

  expect(headers.get('Retry-After')).toBe(`${info.resetIn / 1000}`);

});