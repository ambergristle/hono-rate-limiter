
## TL;DR

A flexible rate limiting solution designed for Hono + (Upstash) Redis (for now), with four built-in algorithms.

Modularity and interoperability are key goals. The `RateLimiter` can be used without the middleware, if you prefer to configure request handling yourself. I'll extend support to [`node-redis`](https://github.com/redis/node-redis) soon, and I'll look into implementing the algorithms using Cloudflare KV.

The middleware was inspired by [`hono-rate-limiter`](https://github.com/rhinobase/hono-rate-limiter), and the algorithms are borrowed from [`@upstash/ratelimit-js](github.com/upstash/ratelimit-js) and [Lucia Auth](https://lucia-auth.com/rate-limit/token-bucket).

## Get Started

```typescript
import { Redis } from '@upstash/redis';
import { rateLimiter } from '@ambergristle/hono-rate-limiter';
import { FixedWindowCounter } from '@ambergristle/hono-rate-limiter/algorithms';

const globalGetLimiter = rateLimiter({
  client: Redis.fromEnv(), // don't forget to set env variables!
  algorithm: FixedWindowCounter.init(100, 60),
  cost: (c) => c.req.method === 'GET' ? 1 : 3,
  generateKey:  getConnInfo(c).remote.address,
});

const app = new Hono()
  .use('*', globalGetLimiter)
  .get('/', (c) => c.text('Rate limited!'));

export default app;
```

### Generate identifiers from Context variables

```typescript
type AuthEnv = {
  Variables: {
    user: { userId: string };
  }
}

const userLimiter = rateLimiter<AuthEnv>({
  // ...
  generateKey: (c) => c.var.user.userId,
});


```

### Initialize limiter from Context

```typescript
type RedisEnv = {
  Variables: {
    client: Redis;
  }
}

rateLimiter<RedisEnv>({
  client: (c) => c.var.client,
  // ...
});
```

### Make sure cache is persisted beyond requests

```typescript
const blockedCache = new Map<string, number>();

rateLimiter<RedisEnv>({
  // ...
  blockedCache,
});
```

## Roadmap

#### clear blocked cache

#### improve tests
- optimise test design
- add algorithm-specific tests
- add performance testing

#### reset all
- should this exist at the `RateLimiter` level?
- make sure to only clear policy-specific limits

#### deny list
- allow identifiers? to be blacklisted

#### improve errors
- distinguish between different error types?

#### format
- naming
- divide remaining by cost?

### Future

#### safe load scripts
- look into prehashing, should be ez
- preload less likely scripts

#### dynamic cost window log
- doesn't obviously make sense, poses some serious technical challenges

#### dynamic refunds
- only required if limiter is untethered from middleware

## tests

[x] headers

[x] cache

middleware
  [] configuration (validate required arguments and outputs)
  [] headers
  [] error response

algorithms
  [x] configuration (validate required arguments and outputs)
  [x] basic
    [x] returns rate limit info and limiter result'
    [x] blocks after limit exceeded
    [x] allows additional requests after reset
    [x] works consistently (this is a weak test)
    [x] rejects all requests if max=0
  [] specific
    [] fixed doubled at boundaries
    [] sliding smooth at boundaries
    [] log exact
    [] bucket? burst and rate
  [x] check: check method returns current rate limit info
  [x] refund: refund method restores quota units
  [x] reset: reset method deletes identifier bucket

  performance
    [] response time
    [] resource use
  - concurrent requests
  - multiple users (limits isolated per id)
  - configurable windows