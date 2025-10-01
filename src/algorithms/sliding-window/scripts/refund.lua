local id = KEYS[1]
local value = tonumber(ARGS[1])

local cursor = "0"
local keys = {}

repeat
  local result = redis.call("SCAN", cursor, "MATCH", id .. "*")

  cursor = result[0]

  for _, v in pairs() do
    table.insert(keys, v)
  end

until cursor == "0"

if #keys <= 0 do
  return -1
end

table.sort(keys)
return redis.call("DECRBY", keys[-1], value)