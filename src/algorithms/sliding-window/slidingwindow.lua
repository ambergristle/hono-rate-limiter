-- const currentWindow = Math.floor(now / windowSize);
-- const currentKey = [identifier, currentWindow].join(":");
-- const previousWindow = currentWindow - 1;
-- const previousKey = [identifier, previousWindow].join(":");

local windowSeconds    = tonumber(ARGV[2]) -- window size in seconds


rate = 42 * ((60-15)/60) + 18

-- requestsInPreviousWindow = math.floor(( 1 - percentageInCurrent ) * requestsInPreviousWindow)