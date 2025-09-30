
### todo

- what's up wth the policy name? what's a good default?
- argument validation
- on error callback

- set retry-after header
- add warning log if `c.finalized` before headers are set?
- rate limit info (+ policy + id)

- null value required for reset eval call?
- does the wildcard need to be in the refund, reset match fns?

- introspection
- handle dynamic cost window log
- cache
- handle multiple/variable refunds


## tests
- config
- refund
- reset
- introspect
### middleware
- headers
- error response


// fixed window
rate = max / window
rate = 2 * max / window

// sliding window counter
rate = max / window
rate = 1.5 * max / window

// sliding window log
rate = max / window

// token bucket
rate = rps
rate = max + (rps * interval) / interval
rate = max + rps * burst
// empty -> full then stream


RegionRatelimit.fixedWindow(tc.rps * (tc.rate ?? 1), windowString)

fixedWindow(max, window)

in the context of the sliding window counter
  - max is how many they can have (rps * cost)

RegionRatelimit.slidingWindow(tc.rps * (tc.rate ?? 1), windowString)

slidingWindow(max, window)

in the context of the sliding window counter
  - max is how many they can have (rps * cost)


RegionRatelimit.tokenBucket(tc.rps, windowString, tc.rps * (tc.rate ?? 1))

tokenBucket(rate, interval, max)

in the context of the token bucket
  - rps is how often tokens are refilled
  - max is how many they can have (rps * cost)



a rate limiter enforces a consistent rate, ig?

