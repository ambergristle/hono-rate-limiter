import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { LimiterError } from '../../errors';
import { SlidingWindowCounter } from './sliding-window-counter';

const WINDOW = 5;
const LIMIT = 1;
const COST = 1;

let client: Redis;
beforeAll(() => {
  client = new Redis({
    url: process.env.UPSTASH_URL,
    token: process.env.UPSTASH_TOKEN,
  });
})

describe('configuration', () => {

  test('requires max requests >= 0', () => {
    const cb = () => new SlidingWindowCounter(client, {
      max: -1,
      window: WINDOW,
    });

    expect(cb).toThrowError(LimiterError);
  });

  test('requires window duration > 0', () => {
    const cb = () => new SlidingWindowCounter(client, {
      max: LIMIT,
      window: 0,
    });

    expect(cb).toThrowError(LimiterError);
  });

});

describe('behavior', () => {

  let algo: SlidingWindowCounter;
  beforeEach(() => {
    algo = new SlidingWindowCounter(client, {
      window: WINDOW,
      max: LIMIT,
    });
  });

  describe('consume', () => {

    test('returns rate limit info and limiter result', async () => {
      const identifier = crypto.randomUUID();

      const result = await algo.consume(identifier, COST);

      expect(result).toEqual({
        allowed: true,
        window: WINDOW * 1000,
        limit: LIMIT,
        remaining: LIMIT - COST,
        resetIn: expect.any(Number),
        pending: expect.any(Promise),
      });
    });

    test('blocks after limit exceeded', async () => {
      const identifier = crypto.randomUUID();

      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier, COST);
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }
    });

    test('allows additional requests after reset', async () => {
      const identifier = crypto.randomUUID();

      let resetIn = 30 * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier, COST);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }

      setTimeout(async () => {
        const result = await algo.consume(identifier, COST);
        expect(result.allowed).toBe(true);
      }, resetIn)
    });

    test('works consistently', async () => {
      const identifier = crypto.randomUUID();

      let resetIn = WINDOW * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier, COST);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }

      await new Promise((r) => setTimeout(r, resetIn))

      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier, COST);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }
    }, (WINDOW + 1) * 1000);

    test('rejects all requests if max=0', async () => {
      algo = new SlidingWindowCounter(client, {
        window: 30,
        max: 0,
      });

      const identifier = crypto.randomUUID();
      const result = await algo.consume(identifier, COST);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });

  });

  // describe('', () => {
  //   test('smooth across boundaries', () => { });
  // })

  test('check method returns current rate limit info', async () => {
    const identifier = crypto.randomUUID();

    const consumeResult = await algo.consume(identifier, COST);
    expect(consumeResult.remaining).toBe(LIMIT - COST);

    const checkResult = await algo.check(identifier);
    expect(checkResult).toEqual({
      window: WINDOW * 1000,
      limit: LIMIT,
      remaining: LIMIT - COST,
      resetIn: expect.any(Number),
    });
  });

  test('refund method restores quota units', async () => {
    const identifier = crypto.randomUUID();

    await algo.consume(identifier, COST);
    await algo.refund(identifier, COST);

    const result = await algo.check(identifier);
    expect(result.remaining).toBe(LIMIT);
  });

  test('reset method deletes identifier bucket', async () => {
    const identifier = crypto.randomUUID();

    await algo.consume(identifier, COST);
    await algo.reset(identifier);

    const bucket = await client.get(identifier);
    expect(bucket).toBe(null);
  });

});
