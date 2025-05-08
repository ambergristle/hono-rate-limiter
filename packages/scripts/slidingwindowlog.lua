local key           = KEYS[1]           -- identifier including prefixes
local limit         = tonumber(ARGV[1]) -- maximum number of requests per window
local windowSeconds = tonumber(ARGV[2]) -- window size in seconds
local now           = tonumber(ARGV[3]) -- current unix time in seconds

local windowStart = now - windowSeconds

-- clear tokens before window start
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- get current token count (0 if key unset)
local count = redis.call('ZCARD', key)
local nextCount = count + 1

if nextCount > limit then
  return {0, limit - count}

-- add token with current timestamp to sorted set
redis.call('ZADD', key, now, now)
redis.call('EXPIRE', key, 10)

return {1, limit - nextCount}