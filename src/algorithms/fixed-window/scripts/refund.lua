local key  = KEYS[1]
local cost = tonumber(ARGV[1])

local count = redis.call("GET", key)

if count == false then
  return 0
end

if count >= cost then
  count = redis.call("DECRBY", key, cost)
end

return count
