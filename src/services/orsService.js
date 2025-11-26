const orsConfig = require('../config/ors');
const logger = require('../config/logger');
const { getRedisClient } = require('../config/redis');
const crypto = require('crypto');

/**
 * Get directions/route between two points
 * @param {array} startCoords - [longitude, latitude]
 * @param {array} endCoords - [longitude, latitude]
 * @param {object} options - Additional options
 * @returns {Promise<object>}
 */
const getDirections = async (startCoords, endCoords, options = {}) => {
  try {
    const profile = options.profile || orsConfig.profile;
    
    const requestBody = {
      coordinates: [startCoords, endCoords],
      instructions: options.instructions !== false,
      geometry: options.geometry !== false,
      elevation: options.elevation || false,
    };

    // Check cache first
    const cacheKey = generateCacheKey('directions', startCoords, endCoords, profile);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      logger.debug('Using cached ORS directions');
      return cached;
    }

    // Make API request
    const response = await orsConfig.client.post(
      `${orsConfig.endpoints.directions}/${profile}`,
      requestBody
    );

    const route = response.data.routes[0];
    
    const result = {
      distance_meters: route.summary.distance,
      duration_seconds: route.summary.duration,
      geometry: route.geometry,
      bbox: route.bbox,
      instructions: route.segments?.[0]?.steps || [],
    };

    // Cache the result
    await cacheData(cacheKey, result, orsConfig.cacheTTL);

    return result;
  } catch (error) {
    logger.error(`ORS getDirections error: ${error.message}`);
    throw new Error('Failed to get directions from OpenRouteService');
  }
};

/**
 * Geocode an address (forward geocoding)
 * @param {string} address - Address to geocode
 * @returns {Promise<object>}
 */
const geocodeAddress = async (address) => {
  try {
    const cacheKey = generateCacheKey('geocode', address);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      logger.debug('Using cached geocoding result');
      return cached;
    }

    const response = await orsConfig.client.get(orsConfig.endpoints.geocode, {
      params: {
        text: address,
        size: 1, // Return only the best match
      },
    });

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error('Address not found');
    }

    const feature = response.data.features[0];
    const result = {
      coordinates: feature.geometry.coordinates, // [lon, lat]
      address: feature.properties.label,
      confidence: feature.properties.confidence,
    };

    await cacheData(cacheKey, result, orsConfig.cacheTTL);

    return result;
  } catch (error) {
    logger.error(`ORS geocodeAddress error: ${error.message}`);
    throw new Error('Failed to geocode address');
  }
};

/**
 * Reverse geocode coordinates to address
 * @param {number} longitude
 * @param {number} latitude
 * @returns {Promise<string>}
 */
const reverseGeocode = async (longitude, latitude) => {
  try {
    const cacheKey = generateCacheKey('reverse', longitude, latitude);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      logger.debug('Using cached reverse geocoding result');
      return cached;
    }

    const response = await orsConfig.client.get(orsConfig.endpoints.reverseGeocode, {
      params: {
        'point.lon': longitude,
        'point.lat': latitude,
        size: 1,
      },
    });

    if (!response.data.features || response.data.features.length === 0) {
      throw new Error('Location not found');
    }

    const address = response.data.features[0].properties.label;
    
    await cacheData(cacheKey, address, orsConfig.cacheTTL);

    return address;
  } catch (error) {
    logger.error(`ORS reverseGeocode error: ${error.message}`);
    throw new Error('Failed to reverse geocode coordinates');
  }
};

/**
 * Calculate distance matrix between multiple points
 * @param {array} locations - Array of [longitude, latitude] pairs
 * @param {object} options - Additional options
 * @returns {Promise<object>}
 */
const getDistanceMatrix = async (locations, options = {}) => {
  try {
    const profile = options.profile || orsConfig.profile;
    
    const requestBody = {
      locations,
      metrics: options.metrics || ['distance', 'duration'],
      units: 'm', // meters
    };

    const cacheKey = generateCacheKey('matrix', JSON.stringify(locations), profile);
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      logger.debug('Using cached ORS matrix');
      return cached;
    }

    const response = await orsConfig.client.post(
      `${orsConfig.endpoints.matrix}/${profile}`,
      requestBody
    );

    const result = {
      distances: response.data.distances,
      durations: response.data.durations,
      sources: response.data.sources,
      destinations: response.data.destinations,
    };

    await cacheData(cacheKey, result, orsConfig.cacheTTL);

    return result;
  } catch (error) {
    logger.error(`ORS getDistanceMatrix error: ${error.message}`);
    throw new Error('Failed to get distance matrix');
  }
};

/**
 * Calculate ETA and remaining distance from current location to destination
 * @param {array} currentCoords - Current [longitude, latitude]
 * @param {array} destinationCoords - Destination [longitude, latitude]
 * @returns {Promise<object>}
 */
const calculateRemainingRoute = async (currentCoords, destinationCoords) => {
  try {
    const route = await getDirections(currentCoords, destinationCoords);
    
    return {
      remaining_distance_meters: route.distance_meters,
      eta_seconds: route.duration_seconds,
      geometry: route.geometry,
    };
  } catch (error) {
    logger.error(`Calculate remaining route error: ${error.message}`);
    throw error;
  }
};

/**
 * Generate cache key for ORS requests
 */
const generateCacheKey = (...parts) => {
  const key = parts.join(':');
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return `ors:${hash}`;
};

/**
 * Get cached data from Redis
 */
const getCachedData = async (key) => {
  try {
    const redisClient = getRedisClient();
    const cached = await redisClient.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  } catch (error) {
    logger.warn(`Redis cache get error: ${error.message}`);
    return null;
  }
};

/**
 * Cache data in Redis
 */
const cacheData = async (key, data, ttl) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    logger.warn(`Redis cache set error: ${error.message}`);
  }
};

module.exports = {
  getDirections,
  geocodeAddress,
  reverseGeocode,
  getDistanceMatrix,
  calculateRemainingRoute,
};
