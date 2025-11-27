const {
  getRoute,
  geocode,
  reverseGeocode,
} = require("../config/openrouteservice");

/**
 * Calculate route between two points
 * @param {Object} pickup Pickup location {coordinates: [lng, lat], address: string}
 * @param {Object} destination Destination {coordinates: [lng, lat], address: string}
 * @returns {Object} Route data with distance, duration, and geometry
 */
const calculateRoute = async (pickup, destination) => {
  try {
    let startCoords = pickup.coordinates;
    let endCoords = destination.coordinates;

    // Geocode addresses if coordinates not provided
    if (!startCoords && pickup.address) {
      startCoords = await geocode(pickup.address);
    }

    if (!endCoords && destination.address) {
      endCoords = await geocode(destination.address);
    }

    if (!startCoords || !endCoords) {
      throw new Error("Invalid pickup or destination coordinates");
    }

    // Get route from OpenRouteService
    const routeData = await getRoute(startCoords, endCoords);

    // Get addresses if not provided
    let pickupAddress = pickup.address;
    let destinationAddress = destination.address;

    if (!pickupAddress) {
      pickupAddress = await reverseGeocode(startCoords);
    }

    if (!destinationAddress) {
      destinationAddress = await reverseGeocode(endCoords);
    }

    return {
      pickup: {
        coordinates: startCoords,
        address: pickupAddress,
      },
      destination: {
        coordinates: endCoords,
        address: destinationAddress,
      },
      distance_meters: routeData.distance_meters,
      duration_seconds: routeData.duration_seconds,
      route_geometry: routeData.geometry,
    };
  } catch (error) {
    console.error("Route calculation error:", error.message);
    throw error;
  }
};

/**
 * Calculate ETA based on current location and destination
 * @param {Array} currentCoords [longitude, latitude]
 * @param {Array} destinationCoords [longitude, latitude]
 * @returns {Object} ETA data with distance and duration
 */
const calculateETA = async (currentCoords, destinationCoords) => {
  try {
    const routeData = await getRoute(currentCoords, destinationCoords);

    return {
      distance_meters: routeData.distance_meters,
      duration_seconds: routeData.duration_seconds,
      eta_minutes: Math.ceil(routeData.duration_seconds / 60),
    };
  } catch (error) {
    console.error("ETA calculation error:", error.message);
    throw error;
  }
};

module.exports = {
  calculateRoute,
  calculateETA,
  geocode,
  reverseGeocode,
};
