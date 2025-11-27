const rateLimit = require("express-rate-limit");
const { getRedisClient } = require("../config/redis");

/**
 * Create a rate limiter with Redis store
 * @param {Number} windowMs Time window in milliseconds
 * @param {Number} max Maximum requests per window
 * @param {String} message Error message
 */
const createRateLimiter = (
  windowMs = 15 * 60 * 1000,
  max = 100,
  message = "Too many requests"
) => {
  const redisClient = getRedisClient(true);

  // Basic rate limiter without Redis if Redis is unavailable
  if (!redisClient) {
    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        message,
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  // Redis-based rate limiter
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: {
      async increment(key) {
        const current = await redisClient.incr(key);
        if (current === 1) {
          await redisClient.expire(key, Math.ceil(windowMs / 1000));
        }
        return {
          totalHits: current,
          resetTime: new Date(Date.now() + windowMs),
        };
      },
      async decrement(key) {
        const current = await redisClient.decr(key);
        return;
      },
      async resetKey(key) {
        await redisClient.del(key);
      },
    },
  });
};

// Different rate limiters for different endpoints
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  20, // 20 attempts
  "Too many login attempts, please try again later"
);

const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  "Too many requests from this IP, please try again later"
);

const strictLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  10, // 10 requests
  "Too many requests, please slow down"
);

module.exports = {
  authLimiter,
  apiLimiter,
  strictLimiter,
  createRateLimiter,
};
