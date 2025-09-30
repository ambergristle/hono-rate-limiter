import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { FixedWindowCounter } from './fixed-window-counter';

describe('FixedWindowCounter', () => {
  let client: Redis;
  beforeAll(() => {
    client = new Redis({
      url: process.env.UPSTASH_URL,
      token: process.env.UPSTASH_TOKEN,
    });
  })

  const LIMIT = 5;

  let limiter: FixedWindowCounter;
  beforeEach(() => {
    limiter = new FixedWindowCounter(client, {
      window: 30,
      max: LIMIT,
    });
  });

  test('returns rate limit info and limiter result', async () => {
    const identifier = crypto.randomUUID();

    const result = await limiter.consume(identifier, 1);

    expect(result).toEqual({
      success: true,
      window: 30 * 1000,
      limit: 5,
      remaining: 4,
      resetIn: expect.any(Number),
    });
  });

  test('fails after limit exceeded', async () => {
    const identifier = crypto.randomUUID();

    for (let i = 0; i < LIMIT + 1; i++) {
      const result = await limiter.consume(identifier, 1);
      const success = i < LIMIT;
      expect(result.success).toBe(success);
    }
  });

  test('allows additional requests after reset', async () => {
    const identifier = crypto.randomUUID();

    let resetIn = 30 * 1000;
    for (let i = 0; i < LIMIT + 1; i++) {
      const result = await limiter.consume(identifier, 1);
      resetIn = result.resetIn - Date.now();
      const success = i < LIMIT;
      expect(result.success).toBe(success);
    }

    setTimeout(async () => {
      const result = await limiter.consume(identifier, 1);
      expect(result.success).toBe(true);
    }, resetIn)
  });

  test('works repeatedly', async () => {
    const identifier = crypto.randomUUID();

    let resetIn = 30 * 1000;
    for (let i = 0; i < LIMIT + 1; i++) {
      const result = await limiter.consume(identifier, 1);
      resetIn = result.resetIn - Date.now();
      const success = i < LIMIT;
      expect(result.success).toBe(success);
    }

    await new Promise((r) => setTimeout(r, resetIn + 1000))

    for (let i = 0; i < LIMIT + 1; i++) {
      const result = await limiter.consume(identifier, 1);
      resetIn = result.resetIn - Date.now();
      const success = i < LIMIT;
      expect(result.success).toBe(success);
    }
  });

  test('rejects all if max=0', async () => {
    limiter = new FixedWindowCounter(client, {
      window: 30,
      max: 0,
    });

    const identifier = crypto.randomUUID();
    const result = await limiter.consume(identifier, 1);
    expect(result.success).toBe(false);
    expect(result.limit).toBe(0);
  });

});