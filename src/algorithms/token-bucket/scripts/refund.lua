local key   = KEYS[1]
local max   = tonumber(ARGV[1])
local value = tonumber(ARGV[2])

-- get record to prevent over-capacity
local count = redis.call("HMGET", key, "tokens")

-- exit early if no match or bucket full
if (count == false or count == max) then
  return max
end

-- increment count by value, or to max
if count + value <= max then
  count = redis.call("HINCRBY", key, "tokens", value)
else
  count = redis.call("HINCRBY", key, "tokens", max - count)
end

return count