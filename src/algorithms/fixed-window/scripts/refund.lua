local key  = KEYS[1]
local value = tonumber(ARGV[1])

-- get record to prevent over-capacity
local count = redis.call("GET", key)

-- exit early if no match or bucket empty
if (count == nil) then
  return 0
else
  count = tonumber(count)
end

if count == 0 then
  return 0
end

-- decrement count by value, or to zero
if count >= value then
  count = redis.call("DECRBY", key, value)
else
  count = redis.call("DECRBY", key, count)
end

return count
