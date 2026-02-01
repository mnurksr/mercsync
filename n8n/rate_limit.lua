-- rate_limit.lua
-- Keys: 
--   1: rate_limit_key (e.g., "shopify_cost:myshop")
-- Args:
--   1: capacity (e.g., 1000 cost points)
--   2: refill_rate (e.g., 50 points per second)
--   3: cost (cost of the current operation, e.g., 50)
--   4: current_timestamp (in seconds)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Get current bucket state
local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

-- Initialize if missing
if not tokens then
    tokens = capacity
    last_refill = now
end

-- Refill tokens based on time passed
local delta = math.max(0, now - last_refill)
local refilled_tokens = math.floor(delta * refill_rate)

tokens = math.min(capacity, tokens + refilled_tokens)

-- Check if we can afford the cost
if tokens >= cost then
    tokens = tokens - cost
    redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
    redis.call("EXPIRE", key, 600) -- Expire key after 10 mins of inactivity
    return 1 -- Allowed
else
    -- Update last_refill even if rejected to prevent 'free' refill accumulation if we don't request for a long time
    -- Actually for leaky bucket, we usually only update if we consume, or we update the timestamp always
    -- Let's update timestamp only if we refilled to keep it simple, or keep old timestamp?
    -- Standard lazy implementation: update timestamp always
    redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
    return 0 -- Rejected
end
