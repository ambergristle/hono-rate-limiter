-- https://blog.callr.tech/rate-limiting-for-distributed-systems-with-redis-and-lua/

local capacity    = tonumber(ARGV[1]) -- max number of tokens bucket can contain
local leakRate    = tonumber(ARGV[2]) -- number of tokens to drain each interval
local cost        = tonumber(ARGV[3]) -- how many tokens to consume, default is 1
local now         = tonumber(ARGV[4]) -- current unix time in seconds

-- get bucket?

-- elapsed calculated as now - lastUpdated

-- decrement count by leak rate
-- this.drops -= this.leakRate * millisecondsElapsed;

-- calculate next tokens by cost

-- if next > capacity, overflow

-- allow