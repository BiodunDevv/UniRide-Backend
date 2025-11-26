const redis = require("redis");
const logger = require("./logger");

let redisClient = null;
let isConnected = false;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB) || 0,
    });

    redisClient.on("connect", () => {
      logger.info("Redis client connecting...");
    });

    redisClient.on("ready", () => {
      isConnected = true;
      logger.info(
        `✓ Redis connected: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
      );
    });

    redisClient.on("error", (err) => {
      logger.error(`Redis error: ${err.message}`);
      isConnected = false;
    });

    redisClient.on("end", () => {
      isConnected = false;
      logger.warn("Redis client disconnected");
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error(`Error connecting to Redis: ${error.message}`);
    throw error;
  }
};

const getRedisClient = () => {
  if (!redisClient || !isConnected) {
    throw new Error("Redis client not initialized or not connected");
  }
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  await closeRedis();
  process.exit(0);
});

module.exports = {
  connectRedis,
  getRedisClient,
  closeRedis,
  get isConnected() {
    return isConnected;
  },
};
