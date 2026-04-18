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

const decodeEncodedPolyline = (encoded, precision = 5) => {
  if (typeof encoded !== "string" || !encoded.trim()) return [];

  const factor = Math.pow(10, precision);
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      if (index >= encoded.length) return [];
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    const safeLatitude = latitude / factor;
    const safeLongitude = longitude / factor;

    if (!isValidLatitude(safeLatitude) || !isValidLongitude(safeLongitude)) {
      return [];
    }

    coordinates.push([safeLongitude, safeLatitude]);
  }

  return coordinates;
};

const extractLineStringCoordinates = (geometry) => {
  if (Array.isArray(geometry?.coordinates)) {
    return geometry.coordinates;
  }

  if (Array.isArray(geometry?.geometry?.coordinates)) {
    return geometry.geometry.coordinates;
  }

  if (typeof geometry === "string") {
    const decodedPrecisionFive = decodeEncodedPolyline(geometry, 5);
    if (decodedPrecisionFive.length >= 2) return decodedPrecisionFive;

    const decodedPrecisionSix = decodeEncodedPolyline(geometry, 6);
    if (decodedPrecisionSix.length >= 2) return decodedPrecisionSix;
  }

  return [];
};

const sanitizeLineStringGeometry = (geometry) => {
  const coordinates = extractLineStringCoordinates(geometry);

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
