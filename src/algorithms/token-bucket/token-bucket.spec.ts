import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { LimiterError } from '../../errors';
import { TokenBucket } from './token-bucket';

const INTERVAL = 5;
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

  test('requires window duration > 0', () => {
    const cb = () => new TokenBucket(client, {
      max: LIMIT,
      interval: 0,
      rate: COST,
    });

    expect(cb).toThrowError(LimiterError);
  });

  test('requires max requests >= 0', () => {
    const cb = () => new TokenBucket(client, {
      max: -1,
      interval: INTERVAL,
      rate: COST,
    });

    expect(cb).toThrowError(LimiterError);
  });

  test('requires refill rate > 0', () => {
    const cb = () => new TokenBucket(client, {
      max: LIMIT,
      interval: INTERVAL,
      rate: 0,
    });

    expect(cb).toThrowError(LimiterError);
  });

});

describe('behavior', () => {

  let algo: TokenBucket;
  beforeEach(() => {
    algo = new TokenBucket(client, {
      max: LIMIT,
      interval: INTERVAL,
      rate: COST,
    });
  });

  describe('consume', () => {

    test('returns rate limit info and limiter result', async () => {
      const identifier = crypto.randomUUID();

      const result = await algo.consume(identifier);

      expect(result).toEqual({
        allowed: true,
        window: INTERVAL * 1000,
        limit: LIMIT,
        remaining: LIMIT - COST,
        resetIn: expect.any(Number),
        pending: expect.any(Promise),
      });
    });

    test('blocks after limit exceeded', async () => {
      const identifier = crypto.randomUUID();

      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }
    });

    test('allows additional requests after reset', async () => {
      const identifier = crypto.randomUUID();

      let resetIn = 30 * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }

      setTimeout(async () => {
        const result = await algo.consume(identifier);
        expect(result.allowed).toBe(true);
      }, resetIn)
    });

    test('works consistently', async () => {
      const identifier = crypto.randomUUID();

      let resetIn = INTERVAL * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }

      await new Promise((r) => setTimeout(r, resetIn))

      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        resetIn = result.resetIn;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }
    }, (INTERVAL + 1) * 1000);

    test('rejects all requests if max=0', async () => {
      algo = new TokenBucket(client, {
        max: 0,
        interval: INTERVAL,
        rate: COST,
      });

      const identifier = crypto.randomUUID();
      const result = await algo.consume(identifier);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(0);
    });

  });

  // describe('', () => {
  //   test('refill rate', () => { });
  //   test('burst capacity', () => { });
  // })

  test('check method returns current rate limit info', async () => {
    const identifier = crypto.randomUUID();

    const consumeResult = await algo.consume(identifier);
    expect(consumeResult.remaining).toBe(LIMIT - 1);

    const checkResult = await algo.check(identifier);
    expect(checkResult).toEqual({
      window: INTERVAL * 1000,
      limit: LIMIT,
      remaining: LIMIT - COST,
      resetIn: expect.any(Number),
    });
  });

  test('refund method restores quota units', async () => {
    const identifier = crypto.randomUUID();

    const r = await algo.consume(identifier);
    await algo.refund(identifier, COST);

    const result = await algo.check(identifier);
    expect(result.remaining).toBe(LIMIT);
  });

  test('reset method deletes identifier bucket', async () => {
    const identifier = crypto.randomUUID();

    await algo.consume(identifier);
    await algo.reset(identifier);

    const bucket = await client.get(identifier);
    expect(bucket).toBe(null);
  });

});
