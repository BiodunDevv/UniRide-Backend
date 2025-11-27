/**
 * Notification service for Socket.io real-time notifications
 */

let io; // Will be set from server.js

const setSocketIO = (socketIO) => {
  io = socketIO;
};

/**
 * Notify all available drivers about a new ride request
 * @param {Object} rideData Ride information
 */
const notifyAvailableDrivers = (rideData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to("available-drivers").emit("new-ride-request", {
    ride_id: rideData._id,
    pickup_location: rideData.pickup_location,
    destination: rideData.destination,
    fare: rideData.fare,
    departure_time: rideData.departure_time,
    available_seats: rideData.available_seats,
  });

  console.log(
    `📢 Broadcast new ride request to available drivers: ${rideData._id}`
  );
};

/**
 * Notify user that a driver has accepted their ride
 * @param {String} userId User ID
 * @param {Object} driverData Driver information
 */
const notifyRideAccepted = (userId, driverData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`user-${userId}`).emit("ride-accepted", {
    driver: driverData,
    message: "Your ride has been accepted!",
  });

  console.log(`✅ Notified user ${userId} that ride was accepted`);
};

/**
 * Notify driver that user has confirmed the booking
 * @param {String} driverId Driver ID
 * @param {Object} bookingData Booking information
 */
const notifyBookingConfirmed = (driverId, bookingData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`driver-${driverId}`).emit("booking-confirmed", {
    booking: bookingData,
    message: "Booking confirmed by user",
  });

  console.log(`✅ Notified driver ${driverId} that booking was confirmed`);
};

/**
 * Notify user about driver's arrival
 * @param {String} userId User ID
 * @param {Object} driverData Driver information
 */
const notifyDriverArrival = (userId, driverData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`user-${userId}`).emit("driver-arrived", {
    driver: driverData,
    message: "Your driver has arrived at the pickup location",
  });

  console.log(`🚗 Notified user ${userId} of driver arrival`);
};

/**
 * Notify user and driver that ride has ended
 * @param {String} userId User ID
 * @param {String} driverId Driver ID
 * @param {Object} rideData Ride summary
 */
const notifyRideEnded = (userId, driverId, rideData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`user-${userId}`).emit("ride-ended", {
    ride: rideData,
    message: "Your ride has been completed",
  });

  io.to(`driver-${driverId}`).emit("ride-ended", {
    ride: rideData,
    message: "Ride completed successfully",
  });

  console.log(
    `🏁 Notified user ${userId} and driver ${driverId} that ride ended`
  );
};

/**
 * Update user with real-time driver location
 * @param {String} userId User ID
 * @param {Object} locationData Current location and ETA
 */
const updateDriverLocation = (userId, locationData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`user-${userId}`).emit("driver-location-update", locationData);
};

/**
 * Notify about ride cancellation
 * @param {String} targetId User or Driver ID
 * @param {String} targetType 'user' or 'driver'
 * @param {Object} cancellationData Cancellation information
 */
const notifyRideCancellation = (targetId, targetType, cancellationData) => {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  io.to(`${targetType}-${targetId}`).emit("ride-cancelled", {
    ...cancellationData,
    message: "Ride has been cancelled",
  });

  console.log(`❌ Notified ${targetType} ${targetId} of ride cancellation`);
};

module.exports = {
  setSocketIO,
  notifyAvailableDrivers,
  notifyRideAccepted,
  notifyBookingConfirmed,
  notifyDriverArrival,
  notifyRideEnded,
  updateDriverLocation,
  notifyRideCancellation,
};
