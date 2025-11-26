const axios = require('axios');
const logger = require('./logger');

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org';
const ORS_PROFILE = process.env.ORS_PROFILE || 'driving-car';

if (!ORS_API_KEY) {
  logger.warn('ORS_API_KEY not set. OpenRouteService features will not work.');
}

// Create axios instance with default config
const orsClient = axios.create({
  baseURL: ORS_BASE_URL,
  headers: {
    'Authorization': ORS_API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
  },
  timeout: 10000,
});

// Request interceptor for logging
orsClient.interceptors.request.use(
  (config) => {
    logger.debug(`ORS Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error(`ORS Request Error: ${error.message}`);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
orsClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      logger.error(`ORS API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`ORS Network Error: No response received`);
    } else {
      logger.error(`ORS Error: ${error.message}`);
    }
    return Promise.reject(error);
  }
);

const orsConfig = {
  client: orsClient,
  apiKey: ORS_API_KEY,
  baseUrl: ORS_BASE_URL,
  profile: ORS_PROFILE,
  cacheTTL: parseInt(process.env.ORS_CACHE_TTL) || 300,
  
  // Endpoints
  endpoints: {
    directions: '/v2/directions',
    geocode: '/geocode',
    reverseGeocode: '/geocode/reverse',
    matrix: '/v2/matrix',
    isochrones: '/v2/isochrones',
  },
};

module.exports = orsConfig;
