const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isValidLatitude = (value) => {
  const latitude = toNumber(value);
  return latitude !== null && latitude >= -90 && latitude <= 90;
};

const isValidLongitude = (value) => {
  const longitude = toNumber(value);
  return longitude !== null && longitude >= -180 && longitude <= 180;
};

const sanitizeLatLng = (latitude, longitude) => {
  const safeLatitude = toNumber(latitude);
  const safeLongitude = toNumber(longitude);

  if (!isValidLatitude(safeLatitude) || !isValidLongitude(safeLongitude)) {
    return null;
  }

  return {
    latitude: safeLatitude,
    longitude: safeLongitude,
  };
};

const sanitizeLngLatPair = (pair) => {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  return sanitizeLatLng(pair[1], pair[0]);
};

const sanitizeLineStringGeometry = (geometry) => {
  const coordinates = Array.isArray(geometry?.coordinates)
    ? geometry.coordinates
    : Array.isArray(geometry?.geometry?.coordinates)
      ? geometry.geometry.coordinates
      : [];

  const sanitizedCoordinates = coordinates
    .map((coordinate) => sanitizeLngLatPair(coordinate))
    .filter(Boolean)
    .map(({ latitude, longitude }) => [longitude, latitude]);

  if (sanitizedCoordinates.length < 2) {
    return null;
  }

  return {
    type: "LineString",
    coordinates: sanitizedCoordinates,
  };
};

module.exports = {
  toNumber,
  sanitizeLatLng,
  sanitizeLineStringGeometry,
};
