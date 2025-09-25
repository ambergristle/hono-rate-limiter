-- Returns 1 if allowed, 0 if not

local key = KEYS[1]
local now = tonumber(ARGV[1])

local timeoutSeconds = {1, 2, 4, 8, 16, 30, 60, 180, 300}

local fields = redis.call("HGETALL", key)

if #fields == 0 then
  redis.call("HSET", key, "index", 1, "updated_at", now)
  return {1}
end

local index = 0
local updatedAt = 0

for i = 1, #fields, 2 do
  if fields[i] == "index" then
    index = tonumber(fields[i + 1])
  elseif fields[i] == "updated_at" then
    updatedAt = tonumber(fields[i + 1])
  end
end

local allowed = now - updatedAt >= timeoutSeconds[index]

if not allowed then
  return {0}
end

index = math.min(index + 1, #timeoutSeconds)
redis.call("HSET", key, "index", index, "updated_at", now)
return {1}