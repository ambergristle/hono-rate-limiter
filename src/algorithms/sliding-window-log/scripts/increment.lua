local key    = KEYS[1]
local max    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
-- local expiresIn = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])

local windowStart = now - window
redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStart)

local count = redis.call("ZCARD", key)
local nextCount = count + 1

if nextCount > max then
  return {0, max - count}
end

redis.call("ZADD", key, now, now)
redis.call("PEXPIRE", key, window)

return {1, max - nextCount}