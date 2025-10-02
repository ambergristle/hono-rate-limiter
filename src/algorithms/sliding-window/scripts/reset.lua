local id = KEYS[1]

local cursor = "0"

repeat
  local result = redis.call("SCAN", cursor, "MATCH", id .. "*")
  cursor = result[1]

  local keys = result[2]
  if type(keys) == "table" then
    redis.call("DEL", unpack(keys))
  elseif type(keys) == "string" then
    redis.call("DEL", keys)
  end

until cursor == "0"
