
## Current State
- package
  - https://www.freecodecamp.org/news/how-to-create-and-publish-your-first-npm-package/
  - https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages
  - https://nodejs.org/en/learn/modules/publishing-a-package
  - https://medium.com/@kadampritesh46/how-to-publish-your-own-npm-package-a-step-by-step-guide-ff385fbfb246
  - https://docs.npmjs.com/creating-and-publishing-scoped-public-packages
  - https://www.w3schools.com/nodejs/nodejs_publish_package.asp
  - https://dev.to/martinpersson/create-and-publish-your-first-npm-package-a-comprehensive-guide-3l0a
- design more comprehensive test?

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
