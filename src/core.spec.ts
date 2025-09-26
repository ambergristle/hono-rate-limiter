import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono, type MiddlewareHandler } from 'hono';
import { rateLimiter } from './core';
import { MemoryStore } from './store/memory-store';
import { FixedWindowCounter } from './algorithms/fixed-window/fixed-window-counter';

describe('configuration', () => {

  test('requires key generator', async () => { });

  test('calls adapter init', () => { });

});

type AuthEnv = {
  Variables: {
    auth: { userId: string; }
  }
}

const auth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  c.set('auth', { userId: 'mock-user-id' })
  await next();
}

describe('request handling', () => {

  let app: Hono;
  beforeEach(() => {
    app = new Hono();

    app.use('/', auth)

    app.use('/', rateLimiter<AuthEnv>({
      name: 'limiter',
      generateKey: (c) => c.var.auth.userId,
      algo: new FixedWindowCounter(client, {
        max: 100,
        window: 60 * 60,
      }),
    }));

    app.get('/', (c) => c.body(null, 200));
  });

  test('allows initial request', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
  });

  test('rejects requests that exceed limit', async () => { });

  test('allows additional requests after cooldown', async () => { });

  test('blocks all requests if limit is 0', async () => { });

  test('sets headers', async () => { });

  test('refunds', async () => { });
});

describe('refunds', () => {

});