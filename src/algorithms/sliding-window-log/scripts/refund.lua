local key = KEYS[1]

redis.call("ZREMRANGEBYRANK", key, -1, -1)

return redis.call("ZCARD", key)