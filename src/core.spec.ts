import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { type Context, Hono } from 'hono';
import { FixedWindowCounter } from './algorithms/fixed-window/fixed-window-counter';
import { rateLimiter } from './core';
import type { LimiterEnv } from './types';

describe('middleware', () => {
  let client: Redis;
  beforeAll(() => {
    client = Redis.fromEnv();
  });

  describe('configuration', () => {

    test('requires key generator', async () => {
      const cb = () => rateLimiter({
        client,
        algorithm: FixedWindowCounter.init(100, 60),
        cost: 0,
        generateKey: () => crypto.randomUUID(),
      });

      expect(cb).toThrowError();
    });

    test('returns middleware handler', () => {
      const cb = () => rateLimiter({
        client,
        algorithm: FixedWindowCounter.init(100, 60),
        generateKey: () => crypto.randomUUID(),
      });

      expect(cb).not.toThrow();
    });

  });

  type AuthEnv = {
    Variables: {
      user: { userId: string };
    }
  }

  const LIMIT = 10;
  const WINDOW = 5;

  describe('request handling', () => {

    let app: Hono<AuthEnv & LimiterEnv>;
    beforeEach(() => {
      const userId = crypto.randomUUID();

      app = new Hono<AuthEnv & LimiterEnv>()
        .use('/', async (c: Context, next) => {
          c.set('user', { userId })
          await next();
        })
        .use('/', rateLimiter<AuthEnv>({
          client,
          algorithm: FixedWindowCounter.init(LIMIT, WINDOW),
          generateKey: (c) => c.var.user.userId,
        }))
        .get('/', (c) => c.body(null));
    });

    test('allows initial request', async () => {
      const response = await app.request('/');
      expect(response.status).toBe(200);
    });

    test('rejects requests that exceed limit', async () => {
      for (let i = 0; i < LIMIT + 1; i++) {
        const response = await app.request('/');
        const status = i < LIMIT ? 200 : 429;
        expect(response.status).toBe(status);

        const policyHeader = response.headers.get('RateLimit-Policy');
        expect(policyHeader).toBeString();
      }
    });

    test('allows additional requests after cooldown', async () => {
      let resetIn = WINDOW * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const response = await app.request('/');
        const status = i < LIMIT ? 200 : 429;
        expect(response.status).toBe(status);

        if (status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          expect(retryAfterHeader).toMatch(/^\d+$/);

          resetIn = Number(retryAfterHeader) * 1000;
        }
      }

      setTimeout(async () => {
        const response = await app.request('/');
        expect(response.status).toBe(200);
      }, resetIn);
    });

    // consistently

    // test('blocks all requests if limit is 0', async () => { });

    test('refunds', async () => { });

  });

  // response

});
