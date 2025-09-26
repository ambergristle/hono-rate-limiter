local key    = KEYS[1]
local window = ARGV[1] -- milliseconds
local cost   = tonumber(ARGV[2])

local used = redis.call("INCRBY", key, cost)
if used == cost then
  -- set expiration if record was created by call
  redis.call("PEXPIRE", key, window)
end

return used