const redis = require("redis");

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      },
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis Client Error:", err);
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis Connected Successfully");
    });

    await redisClient.connect();
  } catch (error) {
    console.error("❌ Redis Connection Error:", error.message);
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
