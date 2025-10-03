import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Redis } from '@upstash/redis';
import { MemoryCache } from '../../cache';
import { LimiterError } from '../../errors';
import type { Store } from '../types';
import { FixedWindowCounter } from './fixed-window-counter';

const WINDOW = 5;
const LIMIT = 1;
const COST = 1;

describe('FixedWindowCounter', () => {
  let store: Store;
  beforeAll(() => {
    store = {
      client: Redis.fromEnv(),
      blockedCache: new MemoryCache(),
    }
  });

  describe('configuration', () => {

    test('requires max requests >= 0', () => {
      const cb = () => new FixedWindowCounter(store, {
        maxUnits: -1,
        windowSeconds: WINDOW,
      });

      expect(cb).toThrowError(LimiterError);
    });

    test('requires window duration > 0', () => {
      const cb = () => new FixedWindowCounter(store, {
        maxUnits: LIMIT,
        windowSeconds: 0,
      });

      expect(cb).toThrowError(LimiterError);
    });

  });

  describe('behavior', () => {

    let algo: FixedWindowCounter;
    beforeEach(() => {
      algo = new FixedWindowCounter(store, {
        windowSeconds: WINDOW,
        maxUnits: LIMIT,
      });
    });

    describe('consume', () => {

      test('returns rate limit info and limiter result', async () => {
        const identifier = crypto.randomUUID();

        const result = await algo.consume(identifier, COST);

        expect(result).toEqual({
          allowed: true,
          policyName: 'fixed-window',
          identifier,
          windowSeconds: WINDOW,
          maxUnits: LIMIT,
          remainingUnits: LIMIT - COST,
          resetInSeconds: expect.any(Number),
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

        let resetIn = WINDOW * 1000;
        for (let i = 0; i < LIMIT + 1; i++) {
          const result = await algo.consume(identifier, COST);
          resetIn = result.resetInSeconds * 1000;
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
          resetIn = result.resetInSeconds * 1000;
          const allowed = i < LIMIT;
          expect(result.allowed).toBe(allowed);
        }

        await new Promise((r) => setTimeout(r, resetIn))

        for (let i = 0; i < LIMIT + 1; i++) {
          const result = await algo.consume(identifier, COST);
          const allowed = i < LIMIT;
          expect(result.allowed).toBe(allowed);
        }
      }, (WINDOW + 1) * 1000);

      test('rejects all requests if max=0', async () => {
        algo = new FixedWindowCounter(store, {
          windowSeconds: 30,
          maxUnits: 0,
        });

        const identifier = crypto.randomUUID();
        const result = await algo.consume(identifier, COST);
        expect(result.allowed).toBe(false);
        expect(result.maxUnits).toBe(0);
      });

    });

    // describe('', () => {
    //   test('burst possible at boundaries', () => { });
    // })

    test('check method returns current rate limit info', async () => {
      const identifier = crypto.randomUUID();

      const consumeResult = await algo.consume(identifier, COST);
      expect(consumeResult.remainingUnits).toBe(LIMIT - COST);

      const checkResult = await algo.check(identifier);
      expect(checkResult).toEqual({
        policyName: 'fixed-window',
        identifier,
        windowSeconds: WINDOW,
        maxUnits: LIMIT,
        remainingUnits: LIMIT - COST,
        resetInSeconds: expect.any(Number),
      });
    });

    test('refund method restores quota units', async () => {
      const identifier = crypto.randomUUID();

      await algo.consume(identifier, COST);
      await algo.refund(identifier, COST);

      const result = await algo.check(identifier);
      expect(result.remainingUnits).toBe(LIMIT);
    });

    test('reset method deletes identifier bucket', async () => {
      const identifier = crypto.randomUUID();

      await algo.consume(identifier, COST);
      await algo.reset(identifier);

      const bucket = await store.client.get(identifier);
      expect(bucket).toBe(null);
    });

  });
});
