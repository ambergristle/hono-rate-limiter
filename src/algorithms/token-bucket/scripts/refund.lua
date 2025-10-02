local key   = KEYS[1]
local max   = tonumber(ARGV[1])
local value = tonumber(ARGV[2])

local count = redis.call("HMGET", key, "tokens")

if count == false then
  return max
end

count = math.min(max, tonumber(count) + value)
redis.call("HSET", key, "tokens", count)

return count