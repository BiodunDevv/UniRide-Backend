const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const appConfig = require('../config/appConfig');

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any>}
 */
const get = async (key) => {
  try {
    const redisClient = getRedisClient();
    const cached = await redisClient.get(key);
    
    if (cached) {
      logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached);
    }
    
    logger.debug(`Cache miss: ${key}`);
    return null;
  } catch (error) {
    logger.error(`Cache get error for key ${key}: ${error.message}`);
    return null;
  }
};

/**
 * Set cache data with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>}
 */
const set = async (key, value, ttl = 300) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    logger.error(`Cache set error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Delete cached data
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
const del = async (key) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.del(key);
    logger.debug(`Cache deleted: ${key}`);
    return true;
  } catch (error) {
    logger.error(`Cache delete error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Delete multiple keys matching a pattern
 * @param {string} pattern - Pattern to match (e.g., "rides:*")
 * @returns {Promise<number>}
 */
const deletePattern = async (pattern) => {
  try {
    const redisClient = getRedisClient();
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.debug(`Cache deleted ${keys.length} keys matching pattern: ${pattern}`);
      return keys.length;
    }
    
    return 0;
  } catch (error) {
    logger.error(`Cache delete pattern error for ${pattern}: ${error.message}`);
    return 0;
  }
};

/**
 * Check if key exists in cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
const exists = async (key) => {
  try {
    const redisClient = getRedisClient();
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error(`Cache exists error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Set cache with automatic expiry (wrapper for common use cases)
 */
const cacheNearbyRides = async (location, data) => {
  const key = `nearby_rides:${location.latitude}:${location.longitude}`;
  return await set(key, data, appConfig.cache.nearbyRidesTTL);
};

const cacheActiveRides = async (userId, data) => {
  const key = `active_rides:${userId}`;
  return await set(key, data, appConfig.cache.activeRidesTTL);
};

const cacheAdminOverview = async (data) => {
  const key = 'admin:overview';
  return await set(key, data, appConfig.cache.adminOverviewTTL);
};

/**
 * Get cached nearby rides
 */
const getCachedNearbyRides = async (location) => {
  const key = `nearby_rides:${location.latitude}:${location.longitude}`;
  return await get(key);
};

/**
 * Get cached active rides
 */
const getCachedActiveRides = async (userId) => {
  const key = `active_rides:${userId}`;
  return await get(key);
};

/**
 * Get cached admin overview
 */
const getCachedAdminOverview = async () => {
  const key = 'admin:overview';
  return await get(key);
};

/**
 * Invalidate ride-related caches
 */
const invalidateRideCaches = async () => {
  await deletePattern('nearby_rides:*');
  await deletePattern('active_rides:*');
  logger.info('Ride caches invalidated');
};

/**
 * Increment counter in cache
 * @param {string} key - Cache key
 * @param {number} increment - Amount to increment (default: 1)
 * @returns {Promise<number>}
 */
const increment = async (key, increment = 1) => {
  try {
    const redisClient = getRedisClient();
    const result = await redisClient.incrBy(key, increment);
    return result;
  } catch (error) {
    logger.error(`Cache increment error for key ${key}: ${error.message}`);
    return null;
  }
};

/**
 * Decrement counter in cache
 * @param {string} key - Cache key
 * @param {number} decrement - Amount to decrement (default: 1)
 * @returns {Promise<number>}
 */
const decrement = async (key, decrement = 1) => {
  try {
    const redisClient = getRedisClient();
    const result = await redisClient.decrBy(key, decrement);
    return result;
  } catch (error) {
    logger.error(`Cache decrement error for key ${key}: ${error.message}`);
    return null;
  }
};

/**
 * Add item to a list (Redis LIST)
 * @param {string} key - List key
 * @param {any} value - Value to add
 * @returns {Promise<boolean>}
 */
const pushToList = async (key, value) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.rPush(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error(`Cache push to list error for key ${key}: ${error.message}`);
    return false;
  }
};

/**
 * Get all items from a list
 * @param {string} key - List key
 * @returns {Promise<array>}
 */
const getList = async (key) => {
  try {
    const redisClient = getRedisClient();
    const items = await redisClient.lRange(key, 0, -1);
    return items.map((item) => JSON.parse(item));
  } catch (error) {
    logger.error(`Cache get list error for key ${key}: ${error.message}`);
    return [];
  }
};

/**
 * Flush all cache (use with caution)
 * @returns {Promise<boolean>}
 */
const flushAll = async () => {
  try {
    const redisClient = getRedisClient();
    await redisClient.flushDb();
    logger.warn('All cache flushed');
    return true;
  } catch (error) {
    logger.error(`Cache flush all error: ${error.message}`);
    return false;
  }
};

module.exports = {
  get,
  set,
  del,
  deletePattern,
  exists,
  cacheNearbyRides,
  cacheActiveRides,
  cacheAdminOverview,
  getCachedNearbyRides,
  getCachedActiveRides,
  getCachedAdminOverview,
  invalidateRideCaches,
  increment,
  decrement,
  pushToList,
  getList,
  flushAll,
};
