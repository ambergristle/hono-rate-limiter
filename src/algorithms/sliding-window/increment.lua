local previousKey = KEYS[1]           -- key of the previous bucket
local currentKey  = KEYS[2]           -- identifier including prefixes
local limit       = tonumber(ARGV[1]) -- tokens per window
local now         = ARGV[2]           -- current timestamp in milliseconds
local window      = ARGV[3]           -- interval in milliseconds
-- local incrementBy = ARGV[4]           -- increment rate per request at a given value, default is 1
local incrementBy = 1;

-- use timestamp + identifier to get current window, default 0
local requestsInCurrentWindow = redis.call("GET", currentKey)
if requestsInCurrentWindow == false then
  requestsInCurrentWindow = 0
end

-- use timestamp + identifier to get previous window, default 0
local requestsInPreviousWindow = redis.call("GET", previousKey)
if requestsInPreviousWindow == false then
  requestsInPreviousWindow = 0
end

-- i don't get this
-- modulo returns remainder of (now / window) which is then / by window

--[[
modulo gives us how far into the current window we are in ms by dividing
current ms into windows (discarded) and looking at the remainder, i.e., how
many ms have elapsed since the last full window

dividing this by window length gives converts that value into a percentage
--]]
local percentageInCurrent = ( now % window ) / window

-- weighted requests to consider from the previous window
-- 1 represents 100%, i.e., a full window
-- we subtract to determine how much of the sliding window covers the previous
-- window, i.e., if 1/3 covers current, 2/3s must cover previous
-- in essense, we only look at a slice of previous

-- this is why a constant rate is assumed

requestsInPreviousWindow = math.floor(( 1 - percentageInCurrent ) * requestsInPreviousWindow)

-- sum represents number of requests in sliding window
-- if sum exceeds tokens then reject. idk why on equality though
if requestsInPreviousWindow + requestsInCurrentWindow >= limit then
  return -1
end

-- increment current request count
local newValue = redis.call("INCRBY", currentKey, incrementBy)

-- if key has not yet been set, initialize expiration
if newValue == tonumber(incrementBy) then
  -- The first time this key is set, the value will be equal to incrementBy.
  -- So we only need the expire command once
  redis.call("PEXPIRE", currentKey, window * 2 + 1000) -- Enough time to overlap with a new window + 1 second
end

-- remaining is max - (current + previous)
return newValue + requestsInPreviousWindow