local window = tonumber(ARGV[1])
local now    = tonumber(ARGV[2])

local windowStart = now - window
redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStart)

local count = redis.call("ZCARD", key)
return count