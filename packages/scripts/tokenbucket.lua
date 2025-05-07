
local key                   = KEYS[1]           -- identifier including prefixes
local max                   = tonumber(ARGV[1]) -- maximum number of tokens
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

local fields = redis.call("HGETALL", key)

--[[
buckets are set to expire at time count would refill to max if no more
tokens are consumed. a full bucket is the same as no bucket, so deleting
them when they aren't tracking anything minimizes memory footprint.
--]]

-- HGETALL returns an empty table if key does not exist
if #fields == 0 then
	local expiresInSeconds = cost * refillIntervalSeconds
  local count = max - cost
	redis.call("HSET", key, "count", count, "refilled_at", now)
	redis.call("EXPIRE", key, expiresInSeconds)
	return {count, now + interval}
end

-- tokens are a unit of time

local count = 0
local refilledAt = 0

-- extract table values without assuming order
for i = 1, #fields, 2 do
	if fields[i] == "count" then
		count = tonumber(fields[i + 1])
	elseif fields[i] == "refilled_at" then
		refilledAt = tonumber(fields[i + 1])
	end
end

-- how many tokens to add to count based on time since last request
-- refill === elapsed intervals
local refill = math.floor((now - refilledAt) / refillIntervalSeconds)
count = math.min(count + refill, max)
-- tokens = math.min(maxTokens, tokens + numRefills * refillRate)

-- update refill time to include time since last request calculated by elapsed intervals
refilledAt = refilledAt + refill * refillIntervalSeconds

if count < cost then
	return {count, refilledAt + interval}
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

return {count, refilledAt + interval}