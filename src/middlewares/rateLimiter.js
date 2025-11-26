const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const appConfig = require("../config/appConfig");

let redisAvailable = false;
let redisClient = null;

/**
 * Initialize Redis for rate limiting
 */
const initializeRedis = () => {
  try {
    const { getRedisClient } = require("../config/redis");
    redisClient = getRedisClient();
    redisAvailable = true;
    console.log("✅ Rate limiter using Redis store");
  } catch (error) {
    redisAvailable = false;
    console.log("⚠️  Rate limiter using memory store (Redis not connected)");
  }
};

/**
 * Create rate limiter with Redis store
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: appConfig.rateLimit.windowMs,
    max: appConfig.rateLimit.maxRequests,
    message: {
      success: false,
      error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.log(
        `⚠️  Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`
      );
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
    },
    skip: (req) => {
      // Skip rate limiting for admin in development
      if (appConfig.env === "development" && req.userType === "admin") {
        return true;
      }
      return false;
    },
  };

  // Use Redis store if available
  if (redisAvailable && redisClient) {
    defaultOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: "rate_limit:",
    });
  }

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * General API rate limiter
 */
const apiLimiter = createRateLimiter({
  windowMs: appConfig.rateLimit.windowMs, // 15 minutes
  max: appConfig.rateLimit.maxRequests, // 100 requests per window
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
  },
});

/**
 * Auth endpoints rate limiter (stricter)
 */
const authLimiter = createRateLimiter({
  windowMs: appConfig.rateLimit.windowMs, // 15 minutes
  max: appConfig.rateLimit.authMaxRequests, // 5 requests per window
  message: {
    success: false,
    error: "Too many login attempts. Please try again later.",
  },
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Strict rate limiter for sensitive operations
 */
const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute
  message: {
    success: false,
    error: "Too many requests for this operation. Please wait.",
  },
});

/**
 * Upload rate limiter
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: {
    success: false,
    error: "Too many upload attempts. Please try again later.",
  },
});

/**
 * Global rate limiter for all routes
 */
const globalRateLimiter = createRateLimiter();

module.exports = {
  initializeRedis,
  createRateLimiter,
  apiLimiter,
  authLimiter,
  strictLimiter,
  uploadLimiter,
  globalRateLimiter,
};
