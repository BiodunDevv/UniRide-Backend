/**
 * Notification service — Socket.io + in-app record + Expo push notifications
 *
 * Every event fires all three layers:
 *   1. Socket.io  → real-time delivery if the app is open
 *   2. UserNotification (MongoDB) → persistent in-app bell
 *   3. Expo Push  → background/killed-app delivery (iOS APNs + Android FCM)
 */

const UserNotification = require("../models/UserNotification");
const {
  sendPushNotification,
  sendBulkPushNotification,
} = require("./pushNotificationService");
const { enrichNotificationMetadata } = require("./notificationPresentation");

let io; // set from server.js via setSocketIO()

const setSocketIO = (socketIO) => {
  io = socketIO;
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Save a UserNotification record AND send an Expo push.
 * Both are fire-and-forget — a failure here must never crash the caller.
 */
const createAndPush = async (
  userId,
  title,
  message,
  type = "system",
  metadata = {},
) => {
  const normalizedMetadata = enrichNotificationMetadata(type, metadata);

  try {
    // 1. Persist in-app notification
    await UserNotification.create({
      user_id: userId,
      title,
      message,
      type,
      metadata: normalizedMetadata,
    });
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
      data: normalizedMetadata,
    });
  } catch (err) {
    console.error("[Notify] Failed to send push notification:", err.message);
  }
};

/**
 * Bulk-create UserNotification records for many users, then send push to all.
 * DB write happens FIRST so the mobile app can fetch the list immediately
 * when the push arrives.  Includes deduplication by dedup_key in metadata.
 *
 * @param {Array<string>} userIds
 * @param {string} title
 * @param {string} message
 * @param {string} type
 * @param {Object} metadata  — include a unique `dedup_key` to prevent duplicates
 * @returns {{ dbCreated: number, pushResult: Object }}
 */
const createBulkAndPush = async (
  userIds,
  title,
  message,
  type = "system",
  metadata = {},
) => {
  const normalizedMetadata = enrichNotificationMetadata(type, metadata);
  let dbCreated = 0;

  // ── 1. Save in-app notifications (DB first) ───────────────────────────
  try {
    // Deduplication: if metadata has a dedup_key, skip users who already have it
    let idsToNotify = userIds;
    if (normalizedMetadata.dedup_key) {
      const existing = await UserNotification.find({
        "metadata.dedup_key": normalizedMetadata.dedup_key,
        user_id: { $in: userIds },
      })
        .select("user_id")
        .lean();
      const existingSet = new Set(existing.map((e) => e.user_id.toString()));
      idsToNotify = userIds.filter((id) => !existingSet.has(id.toString()));
    }

    if (idsToNotify.length > 0) {
      const docs = idsToNotify.map((uid) => ({
        user_id: uid,
        title,
        message,
        type,
        metadata: normalizedMetadata,
      }));
      const result = await UserNotification.insertMany(docs, {
        ordered: false,
      });
      dbCreated = result.length;
      console.log(
        `[Notify] Bulk-created ${dbCreated} in-app notifications (type: ${type})`,
      );
    }
  } catch (err) {
    console.error("[Notify] Bulk in-app notification error:", err.message);
  }

  // ── 2. Send push notifications ────────────────────────────────────────
  let pushResult = { success: false };
  try {
    pushResult = await sendBulkPushNotification({
      user_ids: userIds,
      title,
      message,
      data: normalizedMetadata,
      notificationType: type,
    });
  } catch (err) {
    console.error("[Notify] Bulk push notification error:", err.message);
  }

  return { dbCreated, pushResult };
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

  console.log(
    `[Notify] Broadcast new ride to available drivers: ${rideData._id}`,
  );
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
      message: "A driver has accepted your ride!",
    });
  }

  const driverName = driverData?.name || "A driver";
  const pickup = driverData?.pickup || "";
  const destination = driverData?.destination || "";
  const route = pickup && destination ? ` from ${pickup} → ${destination}` : "";

  createAndPush(
    userId,
    "Driver Found! 🚗",
    `Great news! ${driverName} will be driving your ride${route}. Get ready for your trip!`,
    "ride",
    { action: "ride_accepted", ...driverData },
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
    io.to(`driver-${userId}`).emit("booking-confirmed", {
      booking: bookingData,
      message: "Your booking has been confirmed!",
    });
  }

  const pickup = bookingData?.pickup || "pickup";
  const destination = bookingData?.destination || "destination";
  const seats = bookingData?.seats > 1 ? `${bookingData.seats} seats · ` : "";
  const fare = bookingData?.fare
    ? `₦${Number(bookingData.fare).toLocaleString()}`
    : "";
  const fareInfo = fare ? ` · ${seats}${fare}` : seats ? ` · ${seats}` : "";

  createAndPush(
    userId,
    "Ride Confirmed ✅",
    `You're all set! ${pickup} → ${destination}${fareInfo}. See you on board!`,
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
      message: "New ride request received",
    });
  }

  const passengerName = bookingData?.passenger_name || "A passenger";
  const pickup = bookingData?.pickup || "pickup";
  const destination = bookingData?.destination || "destination";
  const seats = bookingData?.seats || 1;

  createAndPush(
    driverUserId,
    "New Ride Request 📋",
    `${passengerName} requested ${seats} seat(s) on your ${pickup} → ${destination} ride. Tap to review.`,
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
    "Request Not Accepted",
    `Your ride request (${pickup} → ${destination}) wasn't accepted this time. Browse other available rides to find your trip.`,
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

  const passengerName = cancellationData?.passenger_name || "A passenger";
  const seatsInfo = cancellationData?.seats_freed
    ? ` ${cancellationData.seats_freed} seat(s) freed up on your ride.`
    : "";

  createAndPush(
    driverUserId,
    "Passenger Cancelled",
    `${passengerName} cancelled their booking.${seatsInfo}`,
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
      message: "Your driver has arrived",
    });
  }

  const driverName = driverData?.name
    ? `${driverData.name} is`
    : "Your driver is";

  createAndPush(
    userId,
    "Your Driver Is Here 📍",
    `${driverName} waiting at the pickup point. Please head there now!`,
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
    if (driverId) {
      io.to(`user-${driverId}`).emit("ride-ended", {
        ride: rideData,
        message: "Ride completed successfully",
      });
    }
  }

  // Notify passenger
  createAndPush(
    userId,
    "Trip Complete! 🎉",
    "You've arrived! Thanks for riding with UniRide. Don't forget to rate your driver.",
    "ride",
    { action: "ride_completed", ride_id: rideData?._id },
  );

  // Notify driver
  if (driverId) {
    createAndPush(
      driverId,
      "Trip Complete ✅",
      "Nice work! You've successfully completed a trip.",
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
  const title = "Ride Cancelled";
  const message = isDriver
    ? "A ride you were assigned to has been cancelled."
    : "Your upcoming ride has been cancelled. Book another ride anytime — we've got you covered.";

  createAndPush(targetId, title, message, "ride", {
    action: "ride_cancelled",
    ...cancellationData,
  });

  console.log(`[Notify] Ride cancelled → ${targetType} ${targetId}`);
};

/**
 * Notify a driver that a passenger was auto-added to their ride.
 * Used when auto_accept_bookings is enabled.
 * @param {String} driverUserId
 * @param {Object} data
 */
const notifyDriverPassengerJoined = (driverUserId, data) => {
  if (io) {
    io.to(`user-feed-${driverUserId}`).emit("booking:new_passenger", {
      ...data,
      message: "A new passenger joined your ride",
    });
  }

  const passengerName = data?.passenger_name || "A passenger";
  const pickup = data?.pickup || "pickup";
  const destination = data?.destination || "destination";
  const seats = data?.seats || 1;

  createAndPush(
    driverUserId,
    "New Passenger Onboard 🙋",
    `${passengerName} just booked ${seats} seat(s) on your ${pickup} → ${destination} ride.`,
    "booking",
    { action: "passenger_joined", ...data },
  );

  console.log(`[Notify] Passenger joined → driver user ${driverUserId}`);
};

/**
 * Notify a user that a driver ride matching their pending request is available.
 * @param {String} userId
 * @param {Object} rideData
 */
const notifyMatchingRideAvailable = (userId, rideData) => {
  if (io) {
    io.to(`user-feed-${userId}`).emit("ride:matching_available", {
      ride: rideData,
      message: "A ride matching your route is available!",
    });
  }

  const pickup = rideData?.pickup || "pickup";
  const destination = rideData?.destination || "destination";

  createAndPush(
    userId,
    "Ride Available! 🚗",
    `A driver is heading ${pickup} → ${destination}. Book now before seats fill up!`,
    "ride",
    { action: "matching_ride_available", ride_id: rideData?.ride_id },
  );

  console.log(`[Notify] Matching ride available → user ${userId}`);
};

module.exports = {
  setSocketIO,
  createAndPush,
  createBulkAndPush,
  notifyAvailableDrivers,
  notifyRideAccepted,
  notifyBookingConfirmed,
  notifyDriverNewBooking,
  notifyBookingDeclined,
  notifyDriverBookingCancelled,
  notifyDriverPassengerJoined,
  notifyDriverArrival,
  notifyRideEnded,
  notifyMatchingRideAvailable,
  updateDriverLocation,
  notifyRideCancellation,
};
