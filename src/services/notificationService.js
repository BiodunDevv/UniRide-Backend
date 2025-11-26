const logger = require('../config/logger');

/**
 * Socket.io notification service
 * This service manages Socket.io connections and broadcasts
 */

let io = null;

/**
 * Initialize Socket.io instance
 * @param {object} socketIoInstance - Socket.io server instance
 */
const initialize = (socketIoInstance) => {
  io = socketIoInstance;
  logger.info('Notification service initialized with Socket.io');
};

/**
 * Get Socket.io instance
 * @returns {object}
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initialize() first.');
  }
  return io;
};

/**
 * Emit event to specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
const emitToUser = (userId, event, data) => {
  try {
    const socketIo = getIO();
    socketIo.to(`user:${userId}`).emit(event, data);
    logger.debug(`Emitted ${event} to user ${userId}`);
  } catch (error) {
    logger.error(`Error emitting to user ${userId}: ${error.message}`);
  }
};

/**
 * Emit event to specific room
 * @param {string} room - Room name
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
const emitToRoom = (room, event, data) => {
  try {
    const socketIo = getIO();
    socketIo.to(room).emit(event, data);
    logger.debug(`Emitted ${event} to room ${room}`);
  } catch (error) {
    logger.error(`Error emitting to room ${room}: ${error.message}`);
  }
};

/**
 * Broadcast to all connected clients
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
const broadcast = (event, data) => {
  try {
    const socketIo = getIO();
    socketIo.emit(event, data);
    logger.debug(`Broadcasted ${event} to all clients`);
  } catch (error) {
    logger.error(`Error broadcasting ${event}: ${error.message}`);
  }
};

/**
 * Notify new ride request to nearby drivers
 * @param {array} driverIds - Array of driver IDs
 * @param {object} rideRequest - Ride request data
 */
const notifyDriversNewRequest = (driverIds, rideRequest) => {
  driverIds.forEach((driverId) => {
    emitToUser(driverId, 'new_ride_request', rideRequest);
  });
  logger.info(`Notified ${driverIds.length} drivers of new ride request`);
};

/**
 * Notify student that ride was accepted
 * @param {string} studentId - Student ID
 * @param {object} rideDetails - Ride details
 */
const notifyStudentRideAccepted = (studentId, rideDetails) => {
  emitToUser(studentId, 'ride_accepted', rideDetails);
  logger.info(`Notified student ${studentId} of ride acceptance`);
};

/**
 * Notify student that driver has arrived
 * @param {string} studentId - Student ID
 * @param {object} driverDetails - Driver details
 */
const notifyStudentDriverArrived = (studentId, driverDetails) => {
  emitToUser(studentId, 'driver_arrived', driverDetails);
  logger.info(`Notified student ${studentId} that driver arrived`);
};

/**
 * Notify ride started
 * @param {string} rideId - Ride ID
 * @param {array} studentIds - Array of student IDs in the ride
 */
const notifyRideStarted = (rideId, studentIds) => {
  studentIds.forEach((studentId) => {
    emitToUser(studentId, 'ride_started', { ride_id: rideId });
  });
  logger.info(`Notified students of ride ${rideId} start`);
};

/**
 * Notify ride completed
 * @param {string} rideId - Ride ID
 * @param {array} studentIds - Array of student IDs in the ride
 * @param {string} driverId - Driver ID
 */
const notifyRideCompleted = (rideId, studentIds, driverId) => {
  // Notify students
  studentIds.forEach((studentId) => {
    emitToUser(studentId, 'ride_completed', { ride_id: rideId });
  });
  
  // Notify driver
  emitToUser(driverId, 'ride_completed', { ride_id: rideId });
  
  logger.info(`Notified all participants of ride ${rideId} completion`);
};

/**
 * Stream driver location updates to ride room
 * @param {string} rideId - Ride ID
 * @param {object} location - { latitude, longitude, timestamp }
 */
const streamDriverLocation = (rideId, location) => {
  emitToRoom(`ride:${rideId}`, 'driver_location_update', location);
};

/**
 * Notify booking status change
 * @param {string} studentId - Student ID
 * @param {object} bookingUpdate - Booking update data
 */
const notifyBookingUpdate = (studentId, bookingUpdate) => {
  emitToUser(studentId, 'booking_update', bookingUpdate);
  logger.info(`Notified student ${studentId} of booking update`);
};

/**
 * Notify driver of new booking
 * @param {string} driverId - Driver ID
 * @param {object} bookingDetails - Booking details
 */
const notifyDriverNewBooking = (driverId, bookingDetails) => {
  emitToUser(driverId, 'new_booking', bookingDetails);
  logger.info(`Notified driver ${driverId} of new booking`);
};

/**
 * Send push notification (placeholder for FCM integration)
 * @param {string} userId - User ID
 * @param {object} notification - Notification data
 */
const sendPushNotification = async (userId, notification) => {
  try {
    // TODO: Implement FCM push notification
    logger.info(`Push notification to ${userId}: ${notification.title}`);
    
    // For now, just emit via Socket.io as fallback
    emitToUser(userId, 'notification', notification);
    
    return { success: true };
  } catch (error) {
    logger.error(`Error sending push notification: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initialize,
  getIO,
  emitToUser,
  emitToRoom,
  broadcast,
  notifyDriversNewRequest,
  notifyStudentRideAccepted,
  notifyStudentDriverArrived,
  notifyRideStarted,
  notifyRideCompleted,
  streamDriverLocation,
  notifyBookingUpdate,
  notifyDriverNewBooking,
  sendPushNotification,
};
