import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { LimiterError } from '../../errors';
import { SlidingWindowLog } from './sliding-window-log';
import { Store } from '../types';
import { MemoryCache } from '../../cache';

const WINDOW = 5;
const LIMIT = 1;
const COST = 1;

let store: Store;
beforeAll(() => {
  store = {
    client: Redis.fromEnv(),
    blockedCache: new MemoryCache(),
  }
});

describe('configuration', () => {

  test('requires max requests >= 0', () => {
    const cb = () => new SlidingWindowLog(store, {
      maxUnits: -1,
      windowSeconds: WINDOW,
    });

    expect(cb).toThrowError(LimiterError);
  });

  test('requires window duration > 0', () => {
    const cb = () => new SlidingWindowLog(store, {
      maxUnits: LIMIT,
      windowSeconds: 0,
    });

    expect(cb).toThrowError(LimiterError);
  });

});

describe('behavior', () => {

  let algo: SlidingWindowLog;
  beforeEach(() => {
    algo = new SlidingWindowLog(store, {
      windowSeconds: WINDOW,
      maxUnits: LIMIT,
    });
  });

  describe('consume', () => {

    test('returns rate limit info and limiter result', async () => {
      const identifier = crypto.randomUUID();

      const result = await algo.consume(identifier);

      expect(result).toEqual({
        allowed: true,
        policyName: 'sliding-window-log',
        identifier,
        windowSeconds: WINDOW * 1000,
        maxUnits: LIMIT,
        remainingUnits: LIMIT - COST,
        resetInSeconds: expect.any(Number),
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
        resetIn = result.resetInSeconds * 1000;
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

      let resetIn = WINDOW * 1000;
      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        resetIn = result.resetInSeconds * 1000;
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }

      await new Promise((r) => setTimeout(r, resetIn))

      for (let i = 0; i < LIMIT + 1; i++) {
        const result = await algo.consume(identifier);
        const allowed = i < LIMIT;
        expect(result.allowed).toBe(allowed);
      }
    }, (WINDOW + 1) * 1000);

    test('rejects all requests if max=0', async () => {
      algo = new SlidingWindowLog(store, {
        windowSeconds: 30,
        maxUnits: 0,
      });

      const identifier = crypto.randomUUID();
      const result = await algo.consume(identifier);
      expect(result.allowed).toBe(false);
      expect(result.maxUnits).toBe(0);
    });

  });

  // describe('', () => {
  //   test('exact', () => { });
  // })

  test('check method returns current rate limit info', async () => {
    const identifier = crypto.randomUUID();

    const consumeResult = await algo.consume(identifier);
    expect(consumeResult.remainingUnits).toBe(LIMIT - 1);

    const checkResult = await algo.check(identifier);
    expect(checkResult).toEqual({
      policyName: 'sliding-window-log',
      identifier,
      windowSeconds: WINDOW * 1000,
      maxUnits: LIMIT,
      remainingUnits: LIMIT - COST,
      resetInSeconds: expect.any(Number),
    });
  });

  test('refund method restores quota units', async () => {
    const identifier = crypto.randomUUID();

    const r = await algo.consume(identifier);
    await algo.refund(identifier);

    const result = await algo.check(identifier);
    expect(result.remainingUnits).toBe(LIMIT);
  });

  test('reset method deletes identifier bucket', async () => {
    const identifier = crypto.randomUUID();

    await algo.consume(identifier);
    await algo.reset(identifier);

    const bucket = await store.client.get(identifier);
    expect(bucket).toBe(null);
  });

});
