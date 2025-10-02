import { expect, spyOn, test } from "bun:test";
import { Redis } from "@upstash/redis";
import { RateLimiter } from "./limiter";
import { SlidingWindowCounter } from "./algorithms/sliding-window/sliding-window-counter";


test("cache", async () => {
  const maxTokens = 5;
  const client = Redis.fromEnv();
  await client.scriptFlush()

  let evalshaCalls = 0;
  const proxy = new Proxy(client, {
    get: (target, prop: keyof Redis) => {
      if (prop === 'evalsha') {
        evalshaCalls++
      }
      return target[prop]
    }
  })

  const blockedCache = new Map<string, number>();
  const ratelimit = new RateLimiter({
    client: proxy,
    algorithm: SlidingWindowCounter.init(maxTokens, 60),
    blockedCache,
    keyPrefix: 'limit',
  });

  const consumeSpy = spyOn(ratelimit, 'consume');

  let reqs = 0;
  let ok = 0;

  const identifier = crypto.randomUUID();
  for (let i = 0; i <= maxTokens + 1; i++) {
    reqs++
    const { allowed } = await ratelimit.consume(identifier);
    expect(allowed).toBe(i < maxTokens);
    if (allowed) {
      ok++
    }
  }

  expect(consumeSpy).toHaveBeenCalledTimes(maxTokens + 2);
  expect(evalshaCalls).toBe(maxTokens + 1);

  expect(blockedCache.size).toBe(1);
  blockedCache.forEach((resetAt, key) => {
    expect(key).toEndWith(identifier);
    expect(resetAt).toBeGreaterThan(Date.now());
  })
});