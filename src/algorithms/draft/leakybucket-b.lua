-- Redis script to implement a leaky bucket
-- see https://medium.com/callr-techblog/rate-limiting-for-distributed-systems-with-redis-and-lua-eeea745cb260
-- (c) Florent CHAUVEAU <florent.chauveau@gmail.com>

local now  = tonumber(ARGV[1])
local cps = tonumber(ARGV[2])
local key = KEYS[1]

-- remove tokens < min (older than now() -1s)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - 1)

local last = redis.call('ZRANGE', key, -1, -1)

local next = now

-- if there are entries to count
if type(last) == 'table' and #last > 0 then
  for key,value in pairs(last) do
    next = tonumber(value) + 1 / cps
    break -- break at first item
  end
end

if now > next then
  -- the current timestamp is > than last+1/cps
  -- we'll keep now
  next = now
end

redis.call('ZADD', key, next, next)

return tostring(next - ts)
