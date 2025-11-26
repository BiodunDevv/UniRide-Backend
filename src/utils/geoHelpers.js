/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Calculate distance from GeoJSON points
 * @param {object} point1 - First GeoJSON point { type: 'Point', coordinates: [lon, lat] }
 * @param {object} point2 - Second GeoJSON point
 * @returns {number} - Distance in meters
 */
const calculateDistanceFromPoints = (point1, point2) => {
  const [lon1, lat1] = point1.coordinates;
  const [lon2, lat2] = point2.coordinates;
  return calculateDistance(lat1, lon1, lat2, lon2);
};

/**
 * Convert meters to kilometers
 * @param {number} meters
 * @returns {number} - Distance in kilometers
 */
const metersToKilometers = (meters) => {
  return meters / 1000;
};

/**
 * Convert kilometers to meters
 * @param {number} kilometers
 * @returns {number} - Distance in meters
 */
const kilometersToMeters = (kilometers) => {
  return kilometers * 1000;
};

/**
 * Check if a point is within radius of another point
 * @param {number} lat1 - Latitude of center point
 * @param {number} lon1 - Longitude of center point
 * @param {number} lat2 - Latitude of point to check
 * @param {number} lon2 - Longitude of point to check
 * @param {number} radiusMeters - Radius in meters
 * @returns {boolean}
 */
const isWithinRadius = (lat1, lon1, lat2, lon2, radiusMeters) => {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radiusMeters;
};

/**
 * Create GeoJSON Point from coordinates
 * @param {number} longitude
 * @param {number} latitude
 * @param {string} address - Optional address
 * @returns {object} - GeoJSON Point
 */
const createGeoJSONPoint = (longitude, latitude, address = null) => {
  const point = {
    type: 'Point',
    coordinates: [longitude, latitude],
  };

  if (address) {
    point.address = address;
  }

  return point;
};

/**
 * Validate GeoJSON Point
 * @param {object} point
 * @returns {boolean}
 */
const validateGeoJSONPoint = (point) => {
  if (!point || typeof point !== 'object') return false;
  if (point.type !== 'Point') return false;
  if (!Array.isArray(point.coordinates) || point.coordinates.length !== 2) return false;

  const [longitude, latitude] = point.coordinates;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude < -90 || latitude > 90) return false;

  return true;
};

/**
 * Get bounding box for a center point and radius
 * @param {number} latitude - Center latitude
 * @param {number} longitude - Center longitude
 * @param {number} radiusMeters - Radius in meters
 * @returns {object} - { minLat, maxLat, minLon, maxLon }
 */
const getBoundingBox = (latitude, longitude, radiusMeters) => {
  const R = 6371e3; // Earth radius in meters
  const latRadian = (latitude * Math.PI) / 180;

  // Angular distance in radians
  const angularDistance = radiusMeters / R;

  const minLat = latitude - (angularDistance * 180) / Math.PI;
  const maxLat = latitude + (angularDistance * 180) / Math.PI;

  const deltaLon = Math.asin(Math.sin(angularDistance) / Math.cos(latRadian));
  const minLon = longitude - (deltaLon * 180) / Math.PI;
  const maxLon = longitude + (deltaLon * 180) / Math.PI;

  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
  };
};

/**
 * Build MongoDB geospatial query for nearby locations
 * @param {number} longitude - Center longitude
 * @param {number} latitude - Center latitude
 * @param {number} maxDistanceMeters - Maximum distance in meters
 * @returns {object} - MongoDB $near query
 */
const buildNearQuery = (longitude, latitude, maxDistanceMeters) => {
  return {
    $near: {
      $geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      $maxDistance: maxDistanceMeters,
    },
  };
};

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string} - Formatted distance (e.g., "1.5 km" or "500 m")
 */
const formatDistance = (meters) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
};

/**
 * Calculate estimated time of arrival (ETA)
 * @param {number} distanceMeters - Distance in meters
 * @param {number} speedKmh - Average speed in km/h (default: 40)
 * @returns {number} - ETA in seconds
 */
const calculateETA = (distanceMeters, speedKmh = 40) => {
  const distanceKm = metersToKilometers(distanceMeters);
  const timeHours = distanceKm / speedKmh;
  return Math.round(timeHours * 3600); // Convert to seconds
};

/**
 * Format ETA for display
 * @param {number} seconds - ETA in seconds
 * @returns {string} - Formatted ETA (e.g., "15 mins" or "1 hr 30 mins")
 */
const formatETA = (seconds) => {
  if (seconds < 60) {
    return `${seconds} secs`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} mins`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  
  return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMinutes} mins`;
};

module.exports = {
  calculateDistance,
  calculateDistanceFromPoints,
  metersToKilometers,
  kilometersToMeters,
  isWithinRadius,
  createGeoJSONPoint,
  validateGeoJSONPoint,
  getBoundingBox,
  buildNearQuery,
  formatDistance,
  calculateETA,
  formatETA,
};
