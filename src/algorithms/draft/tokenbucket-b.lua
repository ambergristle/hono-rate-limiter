local key         = KEYS[1]           -- identifier including prefixes
local maxTokens   = tonumber(ARGV[1]) -- maximum number of tokens
local interval    = tonumber(ARGV[2]) -- size of the window in milliseconds
local incrementBy = tonumber(ARGV[5]) -- how many tokens to consume, default is 1
local now         = tonumber(ARGV[4]) -- current timestamp in milliseconds
local refillRate  = tonumber(ARGV[3]) -- how many tokens are refilled after each interval
      
-- get refilled at, token (count) from key bucket
-- HMGET used to grab specified fields
-- non-existent treated as empty hash, hence the need for kv check
local bucket = redis.call("HMGET", key, "refilledAt", "tokens")
      
local refilledAt
local tokens

-- if no refilledAt value set to now, else stored value
-- if no refilledAt value set tokens to max, else stored value
if bucket[1] == false then
  refilledAt = now
  tokens = maxTokens
else
  refilledAt = tonumber(bucket[1])
  tokens = tonumber(bucket[2])
end
      
-- if moved into new window, recalculate
-- determine windows elapsed since last refill
-- update count to max or current + refill entitled
-- update refilledAt to reflect latest window?
if now >= refilledAt + interval then
  local numRefills = math.floor((now - refilledAt) / interval)
  tokens = math.min(maxTokens, tokens + numRefills * refillRate)

  refilledAt = refilledAt + numRefills * interval
end

-- tokens would be 0 if initially 0, and not entitled to refills
-- doing this check instead of tokens < incrementBy allows minor excess
if tokens == 0 then
  return {-1, refilledAt + interval}
end

-- decrement by cost
local remaining = tokens - incrementBy
-- no idea, tbh
local expireAt = math.ceil(((maxTokens - remaining) / refillRate)) * interval
      

redis.call("HSET", key, "refilledAt", refilledAt, "tokens", remaining)
-- PEXPIRE works the same as EXPIRE, but using milliseconds instead of seconds
redis.call("PEXPIRE", key, expireAt)

return {remaining, refilledAt + interval}