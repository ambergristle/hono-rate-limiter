local key = KEYS[1]

-- try to drop the latest timestamp
local refunded = redis.call("ZREMRANGEBYRANK", key, -1, -1)

-- exit early if key match or no timestamp
if refunded == 0 then
  return 0
end

return redis.call("ZCARD", key)