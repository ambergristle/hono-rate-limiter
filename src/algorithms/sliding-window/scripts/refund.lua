local id = KEYS[1]
local value = tonumber(ARGV[1])

local cursor = "0"
local matchingKeys = {}

-- advance cursor until end, addings results to matchingKeys
repeat
  local result = redis.call("SCAN", cursor, "MATCH", id .. "*")
  cursor = result[1]

  local keys = result[2]
  if type(keys) == "table" then
    for k, v in ipairs(keys) do
      table.insert(matchingKeys, v)
    end
  elseif type(keys) == "string" then
    table.insert(matchingKeys, keys)
  end
  
until cursor == "0"

-- exit early if no records
if (#matchingKeys < 1) then
  return 0
end

-- last record is latest window consumed in
table.sort(matchingKeys)
local latestKey = matchingKeys[#matchingKeys]

-- get record to prevent over-capacity
local count = redis.call("GET", latestKey)
-- exit early if at min
if count == 0 then
  return 0
end

-- decrement count by value, or to zero
if count >= value then
  count = redis.call("DECRBY", matchingKeys[#matchingKeys], value)
else
  count = redis.call("DECRBY", matchingKeys[#matchingKeys], count)
end

return count