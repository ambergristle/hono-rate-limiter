local key              = KEYS[1]
local max              = tonumber(ARGV[1])
local expiresInSeconds = tonumber(ARGV[2])
local cost             = tonumber(ARGV[3])
local now              = tonumber(ARGV[1])

local bucket = redis.call("HGETALL", key)

if #bucket == 0 then
  local count = max - cost
  redis.call("HSET", key, "count", count, "refilled_at", now)
  redis.call("EXPIRE", key, expiresInSeconds)
  return {count, expiresInSeconds}
end

local count = 0
local refilledAt = 0

for i = 1, #bucket, 2 do
  if bucket[i] == "count" then
    index = tonumber(bucket[i + 1])
  elseif bucket[i] == "refilled_at" then
    refilledAt = tonumber(bucket[i + 1])
  end
end

if (now - refilledAt) >= expiresInSeconds then
  count = max
  redis.call("HSET", key, "count", count, "refilled_at", now)
end

if count < cost then
  return {count, expiresInSeconds}
end

count = count - cost

redis.call("HSET", key, "count", count, "refilled_at", now)
redis.call("EXPIRE", key, expiresInSeconds)
return {count, expiresInSeconds}




-- local key           = KEYS[1]
-- local window        = ARGV[1]
-- local incrementBy   = ARGV[2] -- increment rate per request at a given value, default is 1

-- local r = redis.call("INCRBY", key, incrementBy)
-- if r == tonumber(incrementBy) then
-- -- The first time this key is set, the value will be equal to incrementBy.
-- -- So we only need the expire command once
-- redis.call("PEXPIRE", key, window)
-- end

-- return r