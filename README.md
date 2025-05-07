why bundle into middleware at all, really?

ig you have the refund handling. but that's only relevant on consumption

you need to hit up a bunch of different redis dbs


- so there's gating certain ops, like totp
  - these might be shared, or one-off
  - this is mainly to prevent brute-forcing
    - only login is throttled?
    - email verification + password reset use expiring bucket
    - other auth ops use refiling bucket
  - might want to additionally limit/manage capacity
- then there's actually managing capacity for resources
  - flagging bots/dispersed attacks
  - some kind of feedback loop


- refill bucket
  - refilled at a steady rate (on request)
  - requests consume some number of tokens
  - reject on 0

- throttler
  - checks whether enough time has passed based on attempt #

- expiring bucket
  - refilled after n seconds have elapsed since creation
  - 