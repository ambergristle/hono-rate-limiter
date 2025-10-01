local id = KEYS[1]

local cursor = "0"

repeat
  -- id .. "*"
  local result = redis.call("SCAN", cursor, "MATCH", id)

  cursor = result[0]

  redis.call("DEL", unpack(result[1]))

until cursor == "0"
