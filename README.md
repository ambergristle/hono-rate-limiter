
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

### Configure response Headers and error Response

```typescript
rateLimiter<RedisEnv>({
  // ...
  headerSpec: 'draft-7', // 'draft-6' | 'draft-7' | 'draft-8'
  refundFailedRequests: true,
  errorResponse: (c) => {
    return c.text('Slow down!', 420);
  }
});
```

### Customize key prefixing

`{keyPrefix?}:{policyName}:{key}`

```typescript
rateLimiter<RedisEnv>({
  // ...
  keyPrefix: 'limit',
  policyName: 'global',
});
```

## Roadmap

#### improve tests, benchmarks
- optimize test design to provide better coverage, use fewer resrouces
- add coverage for algorithm-specific behaviors
- add coverage/benchmarks for limiter performance

#### reset all
- should be able to clear redis policy-prefixed records
- should this exist at the `RateLimiter` level?

#### improve errors
- distinguish between different error types?

### open questions
- how should request cost be communicated to clients
  - is it factored into 

### Future

#### deny list
- allow identifiers? to be blacklisted
- use a reference list as a starting point?

#### safe load scripts
- look into prehashing scripts, should be ez
- add preloading for less-likely scripts, try to load if not found

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