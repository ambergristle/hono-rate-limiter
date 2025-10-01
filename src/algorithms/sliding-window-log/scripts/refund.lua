local key = KEYS[1]
-- local cost = tonumber(ARGS[1])

-- add/remove by cost
redis.call("ZREMRANGEBYRANK", key, -1, -1)

return redis.call("ZCARD", key)