const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const UserNotification = require("../models/UserNotification");
const { getIO } = require("../utils/socketManager");

/**
 * Ride Scheduler — runs periodically to:
 * 1. Auto-close rides whose departure_time has passed (scheduled/available/accepted → cancelled)
 * 2. Timeout pending bookings on rides that are past departure_time with no driver
 */

const GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes after departure time

// ── Auto-close expired rides ────────────────────────────────────────────────
const closeExpiredRides = async () => {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

  try {
    // Find rides past departure + grace that are still open
    const expiredRides = await Ride.find({
      status: { $in: ["scheduled", "available", "accepted"] },
      departure_time: { $lt: cutoff },
    }).populate("pickup_location_id destination_id");

    if (expiredRides.length === 0) return;

    console.log(`⏰ Closing ${expiredRides.length} expired ride(s)...`);

    for (const ride of expiredRides) {
      const wasAvailable = ride.status === "available" && !ride.driver_id;

      ride.status = "cancelled";
      ride.ended_at = new Date();
      await ride.save();

      // Cancel all pending/accepted bookings on this ride
      const affectedBookings = await Booking.find({
        ride_id: ride._id,
        status: { $in: ["pending", "accepted"] },
      }).populate("user_id", "name email");

      const timedOut = wasAvailable; // no driver ever accepted

      for (const booking of affectedBookings) {
        booking.status = "cancelled";
        booking.admin_note = timedOut
          ? "Ride timed out — no driver accepted before departure time."
          : "Ride expired — departure time has passed.";
        await booking.save();

        // Notify user
        try {
          const userId = booking.user_id?._id || booking.user_id;
          await UserNotification.create({
            user_id: userId,
            title: timedOut ? "Ride Request Timed Out" : "Ride Expired",
            message: timedOut
              ? "No driver accepted your ride request before the scheduled departure time. Please try again."
              : "This ride has been cancelled because the departure time has passed.",
            type: "ride",
            metadata: { ride_id: ride._id.toString() },
          });
        } catch (err) {
          console.log("Notification failed (non-critical):", err.message);
        }

        // Socket event
        try {
          const io = getIO();
          const userId = booking.user_id?._id || booking.user_id;
          io.to(`user-feed-${userId}`).emit("booking:updated", {
            booking_id: booking._id.toString(),
            status: "cancelled",
            ride_id: ride._id.toString(),
            reason: timedOut ? "timed_out" : "expired",
          });
        } catch (err) {
          // non-critical
        }
      }

      // Notify ride creator if different from booking users
      try {
        const io = getIO();
        if (ride.created_by) {
          io.to(`user-feed-${ride.created_by}`).emit("ride:expired", {
            ride_id: ride._id.toString(),
            reason: timedOut ? "timed_out" : "expired",
          });
        }
        // Notify drivers watching this ride
        io.to(`ride-${ride._id}`).emit("ride:expired", {
          ride_id: ride._id.toString(),
        });
        if (wasAvailable) {
          io.to("driver-feed").emit("ride:expired", {
            ride_id: ride._id.toString(),
          });
        }
      } catch (err) {
        // non-critical
      }
    }

    console.log(`✅ Closed ${expiredRides.length} expired ride(s)`);
  } catch (error) {
    console.error("❌ Error closing expired rides:", error.message);
  }
};

// ── Start scheduler ─────────────────────────────────────────────────────────
let intervalId = null;
const INTERVAL_MS = 60 * 1000; // Run every 60 seconds

const startRideScheduler = () => {
  if (intervalId) return;

  console.log("⏰ Ride scheduler started (checks every 60s)");

  // Run immediately once on startup
  closeExpiredRides();

  intervalId = setInterval(closeExpiredRides, INTERVAL_MS);
};

const stopRideScheduler = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("⏰ Ride scheduler stopped");
  }
};

module.exports = {
  startRideScheduler,
  stopRideScheduler,
  closeExpiredRides,
};
