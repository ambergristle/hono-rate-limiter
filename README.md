
## Current State

- how do refund or reset handle invalid ids?
  - refund is weird. i don't think it should fail. just not go over max?
  - reset just deletes matching keys; doesn't care about invalid
    - should ensure multiple limiters don't overwrite keys
- test cache
- test middleware
- format and policy naming stuff
- package
- design more comprehensive test?

## tests

[] headers

[] cache

middleware
  [] configuration (validate required arguments and outputs)
  [] headers
  [] error response

algorithms
  [] configuration (validate required arguments and outputs)
  [] basic
    - returns rate limit info and limiter result'
    - blocks after limit exceeded
    - allows additional requests after reset
    * works consistently (this is a weak test)
    - rejects all requests if max=0
  [] specific
  [] check: check method returns current rate limit info
  [] refund: refund method restores quota units
  [] reset: reset method deletes identifier bucket
  performance
    [] response time
    [] resource use
  - concurrent requests
  - multiple users (limits isolated per id)
  - configurable windows

## Roadmap

- error enhancements; storage errors?

#### format
- naming
- divide remaining by cost?
- resetIn to seconds?

#### support multiple policies in rate limit header
- should be simple enough, code-wise
- what's up wth the policy name? what's a good default?

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
