local previousKey = KEYS[1]
local currentKey  = KEYS[2]
local window      = tonumber(ARGV[1])
local max         = tonumber(ARGV[2])
local cost        = tonumber(ARGV[3])
local now         = tonumber(ARGV[4])

local previousCount = redis.call("GET", previousKey)
if previousCount == false then
  previousCount = 0
end

local currentCount = redis.call("GET", currentKey)
if currentCount == false then
  currentCount = 0
end

local currentOverlapPercent = (now % window) / window
local previousOverlapPercent = (1 - currentOverlapPercent)

previousCount = math.floor(previousOverlapPercent * previousCount)
local approximated = previousCount + currentCount

if approximated + cost > max then
  return {0, max - approximated}
end

currentCount = redis.call("INCRBY", currentKey, cost)

if currentCount == cost then
  local overlap = (window * 2) + 1000
  redis.call("PEXPIRE", currentKey, overlap)
end

return {true, max - approximated - cost}
