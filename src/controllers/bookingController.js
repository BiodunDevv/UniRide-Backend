const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const User = require("../models/User");
const PlatformSettings = require("../models/PlatformSettings");
const notificationService = require("../services/notificationService");
const { getIO } = require("../utils/socketManager");

// ── User: Request a ride (creates pending booking) ──────────────────────────
const requestRide = async (req, res, next) => {
  try {
    const { ride_id, payment_method, seats_requested = 1 } = req.body;

    // Fetch platform settings
    const settings = await PlatformSettings.getSettings();

    // Enforce max_seats_per_booking
    if (seats_requested > settings.max_seats_per_booking) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${settings.max_seats_per_booking} seats per booking allowed`,
      });
    }

    // Check maintenance mode
    if (settings.maintenance_mode) {
      return res.status(503).json({
        success: false,
        message:
          "The app is currently under maintenance. Please try again later.",
      });
    }

    if (!["cash", "transfer"].includes(payment_method)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment method" });
    }

    const ride = await Ride.findById(ride_id)
      .populate("pickup_location_id")
      .populate("destination_id");

    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    if (ride.status !== "scheduled") {
      return res
        .status(400)
        .json({ success: false, message: "Ride is not available for booking" });
    }

    const seatsLeft = ride.available_seats - ride.booked_seats;
    if (seats_requested > seatsLeft) {
      return res.status(400).json({
        success: false,
        message: `Only ${seatsLeft} seat(s) remaining`,
      });
    }

    // Prevent duplicate pending bookings
    const existing = await Booking.findOne({
      ride_id,
      user_id: req.user._id,
      status: { $in: ["pending", "accepted", "in_progress"] },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You already have a booking for this ride",
      });
    }

    const booking = await Booking.create({
      ride_id,
      user_id: req.user._id,
      seats_requested,
      total_fare: settings.fare_per_seat
        ? (ride.fare || 0) * seats_requested
        : ride.fare || 0,
      payment_method,
      status: settings.auto_accept_bookings ? "accepted" : "pending",
    });

    // If auto-accept, immediately increment booked seats
    if (settings.auto_accept_bookings) {
      ride.booked_seats += seats_requested;
      await ride.save();
    }

    await booking.populate([
      { path: "ride_id", populate: ["pickup_location_id", "destination_id"] },
    ]);

    // If auto-accepted, notify user immediately
    if (settings.auto_accept_bookings) {
      try {
        const totalFare = booking.total_fare;
        notificationService.notifyBookingConfirmed(req.user._id.toString(), {
          ride_id: ride._id,
          pickup:
            ride.pickup_location_id?.name || ride.pickup_location?.address,
          destination: ride.destination_id?.name || ride.destination?.address,
          departure_time: ride.departure_time,
          fare: totalFare,
          fare_per_seat: ride.fare,
          seats: seats_requested,
        });
      } catch (e) {
        console.error("Auto-accept notification error:", e.message);
      }

      try {
        const io = getIO();
        io.to(`user-feed-${req.user._id}`).emit("booking:updated", {
          booking_id: booking._id.toString(),
          status: "accepted",
          ride_id: ride._id.toString(),
          check_in_code: ride.check_in_code,
        });
      } catch (e) {
        console.log("Socket emit failed (non-critical):", e.message);
      }
    }

    res.status(201).json({
      success: true,
      message: settings.auto_accept_bookings
        ? "Booking confirmed! Your ride is ready."
        : "Ride request submitted. Waiting for driver approval.",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin / Driver: Accept booking ──────────────────────────────────────────
const acceptBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user_id", "name email")
      .populate({
        path: "ride_id",
        populate: ["pickup_location_id", "destination_id"],
      });

    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    // If driver, verify they own this ride
    if (req.user.role === "driver") {
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (
        !driver ||
        !booking.ride_id.driver_id ||
        booking.ride_id.driver_id.toString() !== driver._id.toString()
      ) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized for this ride" });
      }
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    // Check seats still available
    const ride = await Ride.findById(booking.ride_id._id);
    const seatsLeft = ride.available_seats - ride.booked_seats;
    if (booking.seats_requested > seatsLeft) {
      return res
        .status(400)
        .json({ success: false, message: "Not enough seats remaining" });
    }

    booking.status = "accepted";
    booking.reviewed_by = req.user._id;
    booking.reviewed_at = new Date();
    if (req.body.admin_note) booking.admin_note = req.body.admin_note;
    await booking.save();

    // Increment booked seats
    ride.booked_seats += booking.seats_requested;
    await ride.save();

    // Notify user
    try {
      const totalFare =
        booking.total_fare || ride.fare * booking.seats_requested;
      notificationService.notifyBookingConfirmed(
        booking.user_id._id.toString(),
        {
          ride_id: ride._id,
          pickup:
            ride.pickup_location_id?.name || ride.pickup_location?.address,
          destination: ride.destination_id?.name || ride.destination?.address,
          departure_time: ride.departure_time,
          fare: totalFare,
          fare_per_seat: ride.fare,
          seats: booking.seats_requested,
        },
      );
    } catch (e) {
      console.error("Notification error:", e.message);
    }

    // Emit socket event for real-time update
    try {
      const io = getIO();
      io.to(`user-feed-${booking.user_id._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: "accepted",
        ride_id: ride._id.toString(),
        check_in_code: ride.check_in_code,
      });
      // Also notify the ride room
      io.to(`ride-${ride._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: "accepted",
        ride_id: ride._id.toString(),
      });
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Booking accepted", data: booking });
  } catch (error) {
    next(error);
  }
};

// ── Admin / Driver: Decline booking ─────────────────────────────────────────
const declineBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user_id", "name email")
      .populate("ride_id");

    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    // If driver, verify they own this ride
    if (req.user.role === "driver") {
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (
        !driver ||
        !booking.ride_id?.driver_id ||
        booking.ride_id.driver_id.toString() !== driver._id.toString()
      ) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized for this ride" });
      }
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    booking.status = "declined";
    booking.reviewed_by = req.user._id;
    booking.reviewed_at = new Date();
    if (req.body.admin_note) booking.admin_note = req.body.admin_note;
    await booking.save();

    // Emit socket event
    try {
      const io = getIO();
      io.to(`user-feed-${booking.user_id._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: "declined",
        ride_id: booking.ride_id?._id?.toString(),
      });
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Booking declined", data: booking });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Get all bookings (with filters) ──────────────────────────────────
const getAllBookings = async (req, res, next) => {
  try {
    const { status, ride_id, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (ride_id) filter.ride_id = ride_id;

    const bookings = await Booking.find(filter)
      .populate("user_id", "name email profile_picture")
      .populate({
        path: "ride_id",
        populate: ["pickup_location_id", "destination_id"],
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Booking.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: bookings.length,
      total,
      page: Number(page),
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

// ── User: Check in ──────────────────────────────────────────────────────────
const checkInRide = async (req, res, next) => {
  try {
    const { booking_id, check_in_code } = req.body;
    const booking = await Booking.findById(booking_id).populate("ride_id");

    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (booking.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Booking must be accepted before check-in",
      });
    }
    if (booking.ride_id.check_in_code !== check_in_code) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid check-in code" });
    }

    booking.check_in_status = "checked_in";
    booking.status = "in_progress";
    await booking.save();

    const ride = await Ride.findById(booking.ride_id._id);
    if (ride.status === "scheduled" || ride.status === "accepted") {
      ride.status = "in_progress";
      await ride.save();
    }

    // Emit socket events - notify driver and ride room
    try {
      const io = getIO();
      io.to(`ride-${ride._id}`).emit("booking:checkin", {
        booking_id: booking._id.toString(),
        user_id: req.user._id.toString(),
        ride_id: ride._id.toString(),
      });
      // Also notify the driver's personal feed
      if (ride.driver_id) {
        const driver = await Driver.findById(ride.driver_id).select("user_id");
        if (driver) {
          io.to(`user-feed-${driver.user_id}`).emit("booking:checkin", {
            booking_id: booking._id.toString(),
            user_id: req.user._id.toString(),
            ride_id: ride._id.toString(),
          });
        }
      }
      // Emit ride status change so all participants know
      io.to(`ride-${ride._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: "in_progress",
        ride_id: ride._id.toString(),
      });
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Check-in successful", data: booking });
  } catch (error) {
    next(error);
  }
};

// ── Payment status ──────────────────────────────────────────────────────────
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { booking_id, payment_status } = req.body;
    const booking = await Booking.findById(booking_id);
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });

    booking.payment_status = payment_status;
    await booking.save();

    res.status(200).json({
      success: true,
      message: "Payment status updated",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

// ── Rate driver ─────────────────────────────────────────────────────────────
const rateDriver = async (req, res, next) => {
  try {
    const { booking_id, rating, feedback } = req.body;

    if (rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const booking = await Booking.findById(booking_id).populate("ride_id");
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (booking.status !== "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Can only rate completed rides" });
    }
    if (booking.rating) {
      return res.status(400).json({ success: false, message: "Already rated" });
    }

    booking.rating = rating;
    booking.feedback = feedback;
    await booking.save();

    const driver = await Driver.findById(booking.ride_id.driver_id);
    if (driver && driver.updateRating) await driver.updateRating(rating);

    res
      .status(200)
      .json({ success: true, message: "Thank you for your rating!" });
  } catch (error) {
    next(error);
  }
};

// ── User: My bookings ───────────────────────────────────────────────────────
const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user_id: req.user._id })
      .populate({
        path: "ride_id",
        populate: [
          "pickup_location_id",
          "destination_id",
          {
            path: "driver_id",
            populate: { path: "user_id", select: "name profile_picture" },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(50);

    res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    next(error);
  }
};

// ── User: Cancel booking ────────────────────────────────────────────────────
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (["completed", "cancelled", "declined"].includes(booking.status)) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot cancel this booking" });
    }

    const wasAccepted = booking.status === "accepted";
    booking.status = "cancelled";
    await booking.save();

    // Free up seats if was accepted
    if (wasAccepted) {
      const ride = await Ride.findById(booking.ride_id);
      if (ride && ride.booked_seats >= booking.seats_requested) {
        ride.booked_seats -= booking.seats_requested;
        await ride.save();
      }
    }

    // Emit socket event so driver knows about cancellation
    try {
      const io = getIO();
      const ride = await Ride.findById(booking.ride_id);
      if (ride && ride.driver_id) {
        const driver = await Driver.findById(ride.driver_id).select("user_id");
        if (driver) {
          io.to(`user-feed-${driver.user_id}`).emit("booking:cancelled", {
            booking_id: booking._id.toString(),
            ride_id: ride._id.toString(),
            seats_freed: booking.seats_requested,
          });
        }
      }
      // Notify ride room too
      if (ride) {
        io.to(`ride-${ride._id}`).emit("booking:cancelled", {
          booking_id: booking._id.toString(),
          ride_id: ride._id.toString(),
        });
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Booking cancelled", data: booking });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Get bookings for my rides ───────────────────────────────────────
const getDriverBookings = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });

    const { status } = req.query;

    // Find all rides assigned to this driver
    const rideFilter = { driver_id: driver._id };
    const rides = await Ride.find(rideFilter).select("_id");
    const rideIds = rides.map((r) => r._id);

    const bookingFilter = { ride_id: { $in: rideIds } };
    if (status) bookingFilter.status = status;

    const bookings = await Booking.find(bookingFilter)
      .populate("user_id", "name email profile_picture phone")
      .populate({
        path: "ride_id",
        populate: ["pickup_location_id", "destination_id"],
      })
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestRide,
  acceptBooking,
  declineBooking,
  getAllBookings,
  checkInRide,
  updatePaymentStatus,
  rateDriver,
  getMyBookings,
  cancelBooking,
  getDriverBookings,
};
