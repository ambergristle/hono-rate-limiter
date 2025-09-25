
local key                   = KEYS[1]           -- identifier including prefixes
local max                   = tonumber(ARGV[1]) -- maximum number of tokens
-- do headers use seconds?
local refillIntervalSeconds = tonumber(ARGV[2]) -- how often to increment token count
local cost                  = tonumber(ARGV[3]) -- how many tokens to consume, default is 1
-- there is no performant way to get current time within script
local now                   = tonumber(ARGV[4]) -- current unix time in seconds
-- local refillRate  = tonumber(ARGV[5]) -- how many tokens to add per interval

--[[
hashes store two fields (count and refill time). given their small size,
and that all fields are retrieved, there is likely little performance
difference between HGETALL and HMGET.
--]]
local bucket = redis.call("HMGET", key, "tokens", "refilledAt")

--[[
buckets are set to expire at time count would refill to max if no more
tokens are consumed. a full bucket is the same as no bucket, so deleting
them when they aren't tracking anything minimizes memory footprint.
--]]

-- HMGET returns an array of false values if key unset
if bucket[1] == false then
	local expiresInSeconds = cost * refillIntervalSeconds
  local intervalsRemaining = max - cost

	redis.call("HSET", key, "count", intervalsRemaining, "refilled_at", now)
	redis.call("EXPIRE", key, expiresInSeconds)

	return {intervalsRemaining, now + refillIntervalSeconds}
end
-- tokens are a unit of time
local intervalsRemaining = tonumber(bucket[1])
local refilledAt = tonumber(bucket[2])

if now > refilledAt + refillIntervalSeconds then
-- how many tokens to add to count based on time since last request
local elapsedIntervals = math.floor((now - refilledAt) / refillIntervalSeconds)
intervalsRemaining = math.min(intervalsRemaining + elapsedIntervals, max)
-- tokens = math.min(maxTokens, tokens + numRefills * refillRate)

-- max * interval = measure of time in which max is expected to be consumed

-- update refill time to include time since last request 
-- calculated by elapsed intervals
refilledAt = refilledAt + elapsedIntervals * refillIntervalSeconds
end

-- check how -1 is consumed
if count < cost then
	return {0, count, refilledAt + refillIntervalSeconds}
end

-- only decrement cost if bucket has enough tokens
count = count - cost
-- use ceiling?
local expiresInSeconds = (max - count) * refillIntervalSeconds
-- local expireAt = math.ceil(((maxTokens - remaining) / refillRate)) * interval

redis.call("HSET", key, "count", count, "refilled_at", now)
redis.call("EXPIRE", key, expiresInSeconds)
-- PEXPIRE works the same as EXPIRE, but using milliseconds instead of seconds
-- redis.call("PEXPIRE", key, expireAt)

return {count, refilledAt + refillIntervalSeconds}