/**
 * Notification service — Socket.io + in-app record + Expo push notifications
 *
 * Every event fires all three layers:
 *   1. Socket.io  → real-time delivery if the app is open
 *   2. UserNotification (MongoDB) → persistent in-app bell
 *   3. Expo Push  → background/killed-app delivery (iOS APNs + Android FCM)
 */

const UserNotification = require("../models/UserNotification");
const { sendPushNotification } = require("./pushNotificationService");

let io; // set from server.js via setSocketIO()

const setSocketIO = (socketIO) => {
  io = socketIO;
};

// ─── Internal helper ─────────────────────────────────────────────────────────
/**
 * Save a UserNotification record AND send an Expo push.
 * Both are fire-and-forget — a failure here must never crash the caller.
 */
const createAndPush = async (userId, title, message, type = "system", metadata = {}) => {
  try {
    // 1. Persist in-app notification
    await UserNotification.create({ user_id: userId, title, message, type, metadata });
  } catch (err) {
    console.error("[Notify] Failed to save in-app notification:", err.message);
  }

  try {
    // 2. Send Expo push notification
    await sendPushNotification({
      user_id: userId,
      title,
      message,
      notificationType: type,
      data: metadata,
    });
  } catch (err) {
    console.error("[Notify] Failed to send push notification:", err.message);
  }
};

// ─── Exported notification functions ─────────────────────────────────────────

/**
 * Notify all available drivers about a new ride request.
 * Push is skipped here — we cannot enumerate room members without extra DB
 * queries; real-time socket is enough for online drivers.
 */
const notifyAvailableDrivers = (rideData) => {
  if (!io) {
    console.warn("[Notify] Socket.io not initialized");
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

  console.log(`[Notify] Broadcast new ride to available drivers: ${rideData._id}`);
};

/**
 * Notify a user that a driver has accepted their ride booking.
 * @param {String} userId
 * @param {Object} driverData
 */
const notifyRideAccepted = (userId, driverData) => {
  if (io) {
    io.to(`user-${userId}`).emit("ride-accepted", {
      driver: driverData,
      message: "Your ride has been accepted!",
    });
  }

  // Push + in-app (fire-and-forget)
  createAndPush(
    userId,
    "Ride Accepted! 🚗",
    `Your driver ${driverData?.name || "is on the way"}. Get ready!`,
    "ride",
    { action: "ride_accepted", driver: driverData },
  );

  console.log(`[Notify] Ride accepted → user ${userId}`);
};

/**
 * Notify a user that their booking has been confirmed / accepted.
 * Called after a driver or admin accepts the booking.
 * @param {String} userId   — the passenger's user_id
 * @param {Object} bookingData
 */
const notifyBookingConfirmed = (userId, bookingData) => {
  if (io) {
    io.to(`user-${userId}`).emit("booking-confirmed", {
      booking: bookingData,
      message: "Your booking has been confirmed!",
    });
    // Legacy room name used by some clients
    io.to(`driver-${userId}`).emit("booking-confirmed", {
      booking: bookingData,
      message: "Your booking has been confirmed!",
    });
  }

  const pickup = bookingData?.pickup || "pickup";
  const destination = bookingData?.destination || "destination";
  const fare = bookingData?.fare ? ` · ₦${bookingData.fare}` : "";

  createAndPush(
    userId,
    "Booking Confirmed ✅",
    `Your ride from ${pickup} to ${destination}${fare} is confirmed.`,
    "booking",
    { action: "booking_confirmed", ...bookingData },
  );

  console.log(`[Notify] Booking confirmed → user ${userId}`);
};

/**
 * Notify a specific driver that a new booking request needs their review.
 * @param {String} driverUserId  — the driver's user_id (not driver._id)
 * @param {Object} bookingData
 */
const notifyDriverNewBooking = (driverUserId, bookingData) => {
  if (io) {
    io.to(`user-feed-${driverUserId}`).emit("booking:new_request", {
      booking: bookingData,
      message: "A passenger wants to join your ride",
    });
  }

  const pickup = bookingData?.pickup || "pickup";
  const destination = bookingData?.destination || "destination";

  createAndPush(
    driverUserId,
    "New Booking Request 🙋",
    `A passenger wants to join your ride from ${pickup} to ${destination}.`,
    "booking",
    { action: "new_booking_request", ...bookingData },
  );

  console.log(`[Notify] New booking request → driver user ${driverUserId}`);
};

/**
 * Notify a user that their booking was declined.
 * @param {String} userId
 * @param {Object} bookingData
 */
const notifyBookingDeclined = (userId, bookingData) => {
  if (io) {
    io.to(`user-feed-${userId}`).emit("booking:updated", {
      booking_id: bookingData?.booking_id,
      status: "declined",
      ride_id: bookingData?.ride_id,
    });
  }

  const pickup = bookingData?.pickup || "pickup";
  const destination = bookingData?.destination || "destination";

  createAndPush(
    userId,
    "Booking Declined",
    `Your booking request from ${pickup} to ${destination} was not accepted. Please try another ride.`,
    "booking",
    { action: "booking_declined", ...bookingData },
  );

  console.log(`[Notify] Booking declined → user ${userId}`);
};

/**
 * Notify a driver that a user has cancelled their booking.
 * @param {String} driverUserId
 * @param {Object} cancellationData
 */
const notifyDriverBookingCancelled = (driverUserId, cancellationData) => {
  if (io) {
    io.to(`user-feed-${driverUserId}`).emit("booking:cancelled", {
      ...cancellationData,
      message: "A passenger cancelled their booking",
    });
  }

  createAndPush(
    driverUserId,
    "Booking Cancelled",
    `A passenger has cancelled their booking. ${cancellationData?.seats_freed ? `${cancellationData.seats_freed} seat(s) are now available.` : ""}`,
    "booking",
    { action: "booking_cancelled_by_user", ...cancellationData },
  );

  console.log(`[Notify] Booking cancelled by user → driver ${driverUserId}`);
};

/**
 * Notify user about driver's arrival at pickup.
 * @param {String} userId
 * @param {Object} driverData
 */
const notifyDriverArrival = (userId, driverData) => {
  if (io) {
    io.to(`user-${userId}`).emit("driver-arrived", {
      driver: driverData,
      message: "Your driver has arrived at the pickup location",
    });
  }

  createAndPush(
    userId,
    "Driver Arrived! 📍",
    `Your driver ${driverData?.name || ""} has arrived at the pickup location. Please head over now.`,
    "ride",
    { action: "driver_arrived", driver: driverData },
  );

  console.log(`[Notify] Driver arrived → user ${userId}`);
};

/**
 * Notify both user and driver that the ride has ended.
 * @param {String} userId
 * @param {String} driverId  — driver's user_id
 * @param {Object} rideData
 */
const notifyRideEnded = (userId, driverId, rideData) => {
  if (io) {
    io.to(`user-${userId}`).emit("ride-ended", {
      ride: rideData,
      message: "Your ride has been completed",
    });
    io.to(`user-${driverId}`).emit("ride-ended", {
      ride: rideData,
      message: "Ride completed successfully",
    });
  }

  // Notify passenger
  createAndPush(
    userId,
    "Ride Completed 🎉",
    "Your ride has been completed. Thank you for riding with UniRide!",
    "ride",
    { action: "ride_completed", ride_id: rideData?._id },
  );

  // Notify driver
  if (driverId) {
    createAndPush(
      driverId,
      "Ride Completed ✅",
      "You have successfully completed a ride. Great job!",
      "ride",
      { action: "ride_completed", ride_id: rideData?._id },
    );
  }

  console.log(`[Notify] Ride ended → user ${userId}, driver ${driverId}`);
};

/**
 * Update user with real-time driver location (socket only — no push needed).
 */
const updateDriverLocation = (userId, locationData) => {
  if (!io) return;
  io.to(`user-${userId}`).emit("driver-location-update", locationData);
};

/**
 * Notify about ride cancellation.
 * @param {String} targetId   user_id of the recipient
 * @param {String} targetType 'user' | 'driver'
 * @param {Object} cancellationData
 */
const notifyRideCancellation = (targetId, targetType, cancellationData) => {
  if (io) {
    io.to(`${targetType}-${targetId}`).emit("ride-cancelled", {
      ...cancellationData,
      message: "Ride has been cancelled",
    });
  }

  const isDriver = targetType === "driver";
  const title = isDriver ? "Ride Cancelled" : "Your Ride Was Cancelled";
  const message = isDriver
    ? "A ride you were assigned to has been cancelled."
    : "Your ride has been cancelled. Please book another ride.";

  createAndPush(
    targetId,
    title,
    message,
    "ride",
    { action: "ride_cancelled", ...cancellationData },
  );

  console.log(`[Notify] Ride cancelled → ${targetType} ${targetId}`);
};

module.exports = {
  setSocketIO,
  notifyAvailableDrivers,
  notifyRideAccepted,
  notifyBookingConfirmed,
  notifyDriverNewBooking,
  notifyBookingDeclined,
  notifyDriverBookingCancelled,
  notifyDriverArrival,
  notifyRideEnded,
  updateDriverLocation,
  notifyRideCancellation,
};
