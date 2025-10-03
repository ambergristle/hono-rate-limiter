
## Get Started

```typescript
import { rateLimiter, RateLimiter, FixedWindowCounter } from '@ambergristle/hono-rate-limiter';

const globalGetLimiter = rateLimiter({
  limiter: new RateLimiter({
    client,
    algorithm: (store) => new FixedWindowCounter(store, {
      maxUnits: 100,
      windowSeconds: 60,
    }),
  }),
  cost: 1,
  generateKey: (c) => getConnInfo(c).remote.address,
});

const app = new Hono();

app.use('*', async (c, next) => {
  if (c.req.method === 'GET') {
    await globalGetLimiter(c, next);
  }

  await next();
});

app.get('/', (c) => c.text('Rate limited!'));
```

### Generate identifiers from Context variables

```typescript
rateLimiter<{
  Variables: {
    user: { userId: string };
  }
}>({
  // ...
  generateKey: (c) => c.var.user.userId,
});
```

### Initialize limiter from Context

```typescript
rateLimiter<{
  Variables: {
    client: Redis;
  }
}>({
  // ...
  limiter: (c) => {
    return new RateLimiter({
      client: c.var.client,
      algorithm: (store) => new FixedWindowCounter(store, {
        maxUnits: 100,
        windowSeconds: 60,
      }),
    });
  },
});
```

## Roadmap

- error enhancements; storage errors?

#### format
- naming
- divide remaining by cost?

#### research pk generation
- should it be abstracted?
- https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-08#section-5.1

#### reset all

#### deny list

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