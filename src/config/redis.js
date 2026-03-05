const redis = require("redis");

let redisClient;
let redisErrorLogged = false;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) return false; // Stop retrying after 3 attempts
          return Math.min(retries * 500, 3000);
        },
      },
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on("error", (err) => {
      if (!redisErrorLogged) {
        console.warn(
          "⚠️ Redis unavailable:",
          err.message,
          "— app will continue without caching",
        );
        redisErrorLogged = true;
      }
    });

    redisClient.on("connect", () => {
      redisErrorLogged = false;
      console.log("✅ Redis Connected Successfully");
    });

    await redisClient.connect();
  } catch (error) {
    console.warn(
      "⚠️ Redis Connection Failed:",
      error.message,
      "— app will continue without caching",
    );
    // Don't exit process, allow app to run without Redis
  }
};

const getRedisClient = (silent = false) => {
  if (!redisClient || !redisClient.isOpen) {
    if (!silent) {
      console.warn("⚠️ Redis client not available");
    }
    return null;
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };
