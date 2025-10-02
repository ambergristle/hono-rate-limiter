local id = KEYS[1]
local value = tonumber(ARGV[1])

local cursor = "0"
local matchingKeys = {}

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

if (#matchingKeys < 1) then
  return 0
end

table.sort(matchingKeys)
local key = matchingKeys[#matchingKeys]

local count = redis.call("GET", key)
if count == 0 then
  return 0
end

count = math.max(0, count - value)

return redis.call("SET", matchingKeys[#matchingKeys], value)