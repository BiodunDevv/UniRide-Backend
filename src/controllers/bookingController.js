const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const User = require("../models/User");
const PlatformSettings = require("../models/PlatformSettings");
const notificationService = require("../services/notificationService");
const { getIO } = require("../utils/socketManager");

const ensureUserHasBookingPhone = async (userId) => {
  const rider = await User.findById(userId).select("name phone");
  if (!rider) {
    return {
      ok: false,
      status: 404,
      message: "User not found",
    };
  }

  if (!rider.phone || !String(rider.phone).trim()) {
    return {
      ok: false,
      status: 400,
      message:
        "Add your phone number in Edit Profile before requesting or booking a ride.",
    };
  }

  return { ok: true, rider };
};

const shouldShowBankDetails = (booking) =>
  booking?.payment_method === "transfer" &&
  ["accepted", "in_progress", "completed"].includes(booking?.status);

const applyBankDetailsVisibility = (booking) => {
  booking.bank_details_visible = shouldShowBankDetails(booking);
  return booking;
};

const BOOKING_RIDE_PASSENGER_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
];

const getRidePassengersMap = async (rideIds) => {
  if (!rideIds.length) return new Map();

  const rideBookings = await Booking.find({
    ride_id: { $in: rideIds },
    status: { $in: BOOKING_RIDE_PASSENGER_STATUSES },
  })
    .populate("user_id", "name profile_picture phone")
    .sort({ createdAt: 1 });

  const passengersByRide = new Map();

  for (const rideBooking of rideBookings) {
    const rideKey = rideBooking.ride_id?.toString?.();
    if (!rideKey) continue;

    const userDoc =
      rideBooking.user_id && typeof rideBooking.user_id === "object"
        ? rideBooking.user_id
        : null;
    const userId =
      userDoc?._id?.toString?.() ||
      (typeof rideBooking.user_id === "string" ? rideBooking.user_id : null);

    const passenger = {
      booking_id: rideBooking._id,
      user_id: userId,
      name: userDoc?.name || "Passenger",
      phone: userDoc?.phone || null,
      profile_picture: userDoc?.profile_picture || null,
      seats_requested: rideBooking.seats_requested,
      status: rideBooking.status,
      check_in_status: rideBooking.check_in_status,
      booking_time: rideBooking.booking_time,
      createdAt: rideBooking.createdAt,
    };

    const existingPassengers = passengersByRide.get(rideKey) || [];
    existingPassengers.push(passenger);
    passengersByRide.set(rideKey, existingPassengers);
  }

  return passengersByRide;
};

// ── User: Request a ride (creates pending booking) ──────────────────────────
const requestRide = async (req, res, next) => {
  try {
    const { ride_id, payment_method, seats_requested = 1 } = req.body;
    const riderCheck = await ensureUserHasBookingPhone(req.user._id);
    if (!riderCheck.ok) {
      return res.status(riderCheck.status).json({
        success: false,
        message: riderCheck.message,
      });
    }

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

    if (!["scheduled", "available", "accepted"].includes(ride.status)) {
      return res.status(400).json({
        success: false,
        message: "Ride can no longer be booked",
      });
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
      bank_details_visible:
        payment_method === "transfer" && settings.auto_accept_bookings,
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
    }

    // Emit real-time booking update for both rider feed and ride room.
    try {
      const io = getIO();
      const bookingStatus = settings.auto_accept_bookings
        ? "accepted"
        : "pending";
      io.to(`user-feed-${req.user._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: bookingStatus,
        ride_id: ride._id.toString(),
        ...(settings.auto_accept_bookings
          ? { check_in_code: ride.check_in_code }
          : {}),
      });
      io.to(`ride-${ride._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        status: bookingStatus,
        ride_id: ride._id.toString(),
      });
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    // If auto-accepted and ride has a driver, notify driver about new passenger
    if (settings.auto_accept_bookings && ride.driver_id) {
      try {
        const driverDoc = await Driver.findById(ride.driver_id);
        if (driverDoc) {
          const pickup =
            ride.pickup_location_id?.name ||
            ride.pickup_location?.address ||
            "pickup";
          const destination =
            ride.destination_id?.name ||
            ride.destination?.address ||
            "destination";
          notificationService.notifyDriverPassengerJoined(
            driverDoc.user_id.toString(),
            {
              booking_id: booking._id.toString(),
              ride_id: ride._id.toString(),
              pickup,
              destination,
              seats: seats_requested,
              passenger_name: req.user.name || "A passenger",
            },
          );
        }
      } catch (e) {
        console.error("Driver notification error:", e.message);
      }
    }

    // If NOT auto-accepted and the ride has a driver, notify the driver about the pending booking
    if (!settings.auto_accept_bookings && ride.driver_id) {
      try {
        const driverDoc = await Driver.findById(ride.driver_id);
        if (driverDoc) {
          const pickup = ride.pickup_location_id?.name || "pickup";
          const destination = ride.destination_id?.name || "destination";
          notificationService.notifyDriverNewBooking(
            driverDoc.user_id.toString(),
            {
              booking_id: booking._id.toString(),
              ride_id: ride._id.toString(),
              pickup,
              destination,
              seats: seats_requested,
              passenger_name: req.user.name || "A passenger",
            },
          );
        }
      } catch (e) {
        console.error("Driver booking notification error:", e.message);
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
    applyBankDetailsVisibility(booking);
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

      const rideCreatorId = booking.ride_id?.created_by
        ? booking.ride_id.created_by.toString()
        : null;
      if (!rideCreatorId || rideCreatorId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Only the driver who created this ride can decline bookings",
        });
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
    applyBankDetailsVisibility(booking);
    await booking.save();

    // Send in-app + push notification to user
    notificationService.notifyBookingDeclined(booking.user_id._id.toString(), {
      booking_id: booking._id.toString(),
      ride_id: booking.ride_id?._id?.toString(),
      pickup: booking.ride_id?.pickup_location_id?.name,
      destination: booking.ride_id?.destination_id?.name,
    });

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
    const { status, ride_id, user_id, page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageSize = Math.max(Number(limit) || 20, 1);

    const filter = {};
    if (status) filter.status = status;
    if (ride_id) filter.ride_id = ride_id;
    if (user_id) filter.user_id = user_id;

    const bookings = await Booking.find(filter)
      .populate("user_id", "name email profile_picture phone")
      .populate({
        path: "ride_id",
        populate: [
          "pickup_location_id",
          "destination_id",
          {
            path: "created_by",
            select: "name profile_picture phone",
          },
          {
            path: "driver_id",
            select:
              "user_id phone vehicle_model plate_number vehicle_color rating vehicle_image is_online",
            populate: {
              path: "user_id",
              select: "name profile_picture phone",
            },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    const rideIds = Array.from(
      new Set(
        bookings
          .map((booking) => {
            const bookingRide = booking.ride_id;
            if (bookingRide && typeof bookingRide === "object") {
              return bookingRide._id?.toString?.() || null;
            }
            return typeof bookingRide === "string" ? bookingRide : null;
          })
          .filter(Boolean),
      ),
    );

    const ridePassengersMap = await getRidePassengersMap(rideIds);

    const data = bookings.map((booking) => {
      const bookingObj = booking.toObject();
      const bookingRide = booking.ride_id;
      const bookingRideId =
        bookingRide && typeof bookingRide === "object"
          ? bookingRide._id?.toString?.()
          : typeof bookingRide === "string"
            ? bookingRide
            : null;

      return {
        ...bookingObj,
        ride_passengers: bookingRideId
          ? ridePassengersMap.get(bookingRideId) || []
          : [],
      };
    });

    const total = await Booking.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page: pageNumber,
      data,
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
    // NOTE: Do NOT change booking.status or ride.status here.
    // Check-in only marks attendance. The ride transitions to "in_progress"
    // when the driver explicitly starts the ride.
    await booking.save();

    const ride = await Ride.findById(booking.ride_id._id);

    // Notify driver about passenger check-in
    if (ride.driver_id) {
      const driverDoc = await Driver.findById(ride.driver_id).select("user_id");
      if (driverDoc) {
        const passenger = await User.findById(req.user._id).select("name");
        notificationService.createAndPush(
          driverDoc.user_id,
          "Passenger Checked In ✅",
          `${passenger?.name || "A passenger"} has checked in for your ride.`,
          "booking",
          {
            action: "passenger_checked_in",
            booking_id: booking._id.toString(),
            ride_id: ride._id.toString(),
          },
        );
      }
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
      // Emit ride status change so all participants know about check-in
      io.to(`ride-${ride._id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        check_in_status: "checked_in",
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
    applyBankDetailsVisibility(booking);
    await booking.save();

    // Emit real-time socket event so both sides update instantly
    try {
      const io = getIO();
      const rideId =
        typeof booking.ride_id === "object"
          ? booking.ride_id._id
          : booking.ride_id;

      let rideDriverUserId = null;
      if (rideId) {
        const rideDoc = await Ride.findById(rideId).select("driver_id");
        if (rideDoc?.driver_id) {
          const driverDoc = await Driver.findById(rideDoc.driver_id).select(
            "user_id",
          );
          rideDriverUserId = driverDoc?.user_id || null;
        }
      }

      // Notify the ride room (driver + all passengers)
      if (rideId) {
        io.to(`ride-${rideId}`).emit("booking:updated", {
          booking_id: booking._id.toString(),
          payment_status,
          ride_id: rideId.toString(),
        });
      }

      // Notify the passenger's personal feed
      io.to(`user-feed-${booking.user_id}`).emit("booking:updated", {
        booking_id: booking._id.toString(),
        payment_status,
        ride_id: rideId ? rideId.toString() : undefined,
      });

      // Notify the driver's personal feed
      if (rideDriverUserId) {
        io.to(`user-feed-${rideDriverUserId}`).emit("booking:updated", {
          booking_id: booking._id.toString(),
          payment_status,
          ride_id: rideId ? rideId.toString() : undefined,
        });
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    // Notify the passenger about payment status change
    try {
      const statusLabel =
        payment_status === "paid"
          ? "Payment Confirmed ✅"
          : payment_status === "sent"
            ? "Transfer Noted 📝"
            : payment_status === "refunded"
              ? "Refund Processed 💰"
              : `Payment ${payment_status.charAt(0).toUpperCase() + payment_status.slice(1)}`;
      const statusMsg =
        payment_status === "paid"
          ? "Your driver has confirmed receiving your transfer payment. Thank you!"
          : payment_status === "sent"
            ? "Your transfer has been noted. The driver will confirm receipt shortly."
            : payment_status === "refunded"
              ? "Your ride payment has been refunded. The amount will reflect in your account shortly."
              : `Your payment status has been updated to: ${payment_status}.`;
      notificationService.createAndPush(
        booking.user_id,
        statusLabel,
        statusMsg,
        "booking",
        {
          action: "payment_status_updated",
          payment_status,
          booking_id: booking._id.toString(),
        },
      );
    } catch (e) {
      console.error("Payment notification failed:", e.message);
    }

    // If user marked as "sent", also notify the driver to confirm
    if (payment_status === "sent") {
      try {
        const rideId =
          typeof booking.ride_id === "object"
            ? booking.ride_id._id || booking.ride_id
            : booking.ride_id;
        const ride = await Ride.findById(rideId);
        if (ride && ride.driver_id) {
          const driverDoc = await Driver.findById(ride.driver_id).select(
            "user_id",
          );
          if (driverDoc) {
            const passenger = await User.findById(booking.user_id).select(
              "name",
            );
            notificationService.createAndPush(
              driverDoc.user_id,
              "Transfer Payment Sent 💸",
              `${passenger?.name || "A passenger"} says they've sent the transfer payment. Please confirm receipt.`,
              "booking",
              {
                action: "payment_sent_by_passenger",
                booking_id: booking._id.toString(),
                ride_id: rideId.toString(),
              },
            );
          }
        }
      } catch (e) {
        console.error("Driver payment notification failed:", e.message);
      }
    }

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

    // Notify driver about the new rating
    if (driver) {
      notificationService.createAndPush(
        driver.user_id,
        `New ${rating}★ Rating`,
        `A passenger rated their trip ${rating}/5.${feedback ? ` "${feedback.substring(0, 80)}"` : ""} Keep up the great work!`,
        "account",
        {
          action: "new_rating",
          rating,
          booking_id: booking._id.toString(),
        },
      );
    }

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
            path: "created_by",
            select: "name profile_picture phone",
          },
          {
            path: "driver_id",
            populate: {
              path: "user_id",
              select: "name profile_picture phone",
            },
            select:
              "user_id vehicle_model vehicle_color plate_number rating bank_name bank_account_name bank_account_number",
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

    const previousStatus = booking.status;
    const wasSeatReserved = ["accepted", "in_progress"].includes(
      previousStatus,
    );
    booking.status = "cancelled";
    applyBankDetailsVisibility(booking);
    await booking.save();

    // Confirm cancellation to the user
    try {
      notificationService.createAndPush(
        req.user._id.toString(),
        "Booking Cancelled",
        "Your booking has been cancelled successfully. You can browse other rides anytime.",
        "booking",
        {
          action: "booking_cancelled_by_user",
          booking_id: booking._id.toString(),
        },
      );
    } catch (e) {
      console.error("Cancel confirmation notification error:", e.message);
    }

    const ride = await Ride.findById(booking.ride_id);

    // Free up seats if this booking had already reserved one
    if (
      ride &&
      wasSeatReserved &&
      ride.booked_seats >= booking.seats_requested
    ) {
      ride.booked_seats -= booking.seats_requested;
      await ride.save();
    }

    let rideCancelledForEveryone = false;
    const isRequesterRideOwner = Boolean(
      ride?.created_by &&
      ride.created_by.toString() === req.user._id.toString(),
    );
    const wasAcceptedByDriver = ["accepted", "in_progress"].includes(
      previousStatus,
    );

    if (
      ride &&
      isRequesterRideOwner &&
      wasAcceptedByDriver &&
      !["completed", "cancelled"].includes(ride.status)
    ) {
      const remainingActiveBookings = await Booking.countDocuments({
        ride_id: ride._id,
        status: { $in: ["pending", "accepted", "in_progress"] },
      });

      if (remainingActiveBookings === 0) {
        const now = new Date();
        const previousRideStatus = ride.status;
        ride.status = "cancelled";
        ride.cancelled_at = now;
        ride.cancelled_by = req.user._id;
        ride.cancel_reason = "Ride requester cancelled after driver acceptance";
        if (previousRideStatus === "in_progress" && !ride.ended_at) {
          ride.ended_at = now;
        }
        await ride.save();

        await Booking.updateMany(
          {
            ride_id: ride._id,
            status: { $in: ["pending", "accepted", "in_progress"] },
          },
          {
            status: "cancelled",
            reviewed_by: req.user._id,
            reviewed_at: now,
            admin_note:
              "Ride requester cancelled the ride after driver acceptance",
          },
        );

        rideCancelledForEveryone = true;
      }
    }

    // Emit socket event so driver and participants are updated in real-time
    try {
      const io = getIO();

      if (ride && ride.driver_id) {
        const driver = await Driver.findById(ride.driver_id).select("user_id");
        if (driver) {
          if (rideCancelledForEveryone) {
            notificationService.notifyRideCancellation(
              driver.user_id.toString(),
              "driver",
              {
                ride_id: ride._id.toString(),
                reason: ride.cancel_reason,
                cancelled_by: "user",
              },
            );
            io.to(`user-feed-${driver.user_id}`).emit("ride:cancelled", {
              ride_id: ride._id.toString(),
              reason: ride.cancel_reason,
              cancelled_by: "user",
            });
          } else {
            notificationService.notifyDriverBookingCancelled(
              driver.user_id.toString(),
              {
                booking_id: booking._id.toString(),
                ride_id: ride._id.toString(),
                seats_freed: booking.seats_requested,
                passenger_name: req.user.name || "A passenger",
              },
            );
            io.to(`user-feed-${driver.user_id}`).emit("booking:cancelled", {
              booking_id: booking._id.toString(),
              ride_id: ride._id.toString(),
              seats_freed: booking.seats_requested,
            });
          }
        }
      }

      if (ride) {
        if (rideCancelledForEveryone) {
          io.to(`ride-${ride._id}`).emit("ride:cancelled", {
            ride_id: ride._id.toString(),
            reason: ride.cancel_reason,
            cancelled_by: "user",
          });
        } else {
          io.to(`ride-${ride._id}`).emit("booking:cancelled", {
            booking_id: booking._id.toString(),
            ride_id: ride._id.toString(),
          });
        }
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res.status(200).json({
      success: true,
      message: rideCancelledForEveryone
        ? "Booking cancelled and ride closed"
        : "Booking cancelled",
      data: booking,
      ride_cancelled: rideCancelledForEveryone,
    });
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
        populate: [
          "pickup_location_id",
          "destination_id",
          {
            path: "created_by",
            select: "name profile_picture phone",
          },
        ],
      })
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Get Earnings Summary ─────────────────────────────────────────────
const getDriverEarnings = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });

    // Find all completed rides for this driver
    const completedRides = await Ride.find({
      driver_id: driver._id,
      status: "completed",
    })
      .populate("pickup_location_id", "name short_name")
      .populate("destination_id", "name short_name")
      .sort({ ended_at: -1 });

    const rideIds = completedRides.map((r) => r._id);

    // Find all completed bookings for those rides
    const completedBookings = await Booking.find({
      ride_id: { $in: rideIds },
      status: "completed",
    });

    // Calculate earnings per ride
    const rideEarnings = completedRides.map((ride) => {
      const rideBks = completedBookings.filter(
        (b) => b.ride_id.toString() === ride._id.toString(),
      );
      const totalEarned = rideBks.reduce(
        (sum, b) => sum + (b.total_fare || ride.fare * b.seats_requested),
        0,
      );
      const passengers = rideBks.length;
      return {
        ride_id: ride._id,
        pickup:
          ride.pickup_location_id?.short_name ||
          ride.pickup_location_id?.name ||
          "Pickup",
        destination:
          ride.destination_id?.short_name ||
          ride.destination_id?.name ||
          "Destination",
        fare: ride.fare,
        passengers,
        total_earned: totalEarned,
        ended_at: ride.ended_at,
        departure_time: ride.departure_time,
      };
    });

    // Aggregate totals
    const totalEarnings = rideEarnings.reduce(
      (sum, r) => sum + r.total_earned,
      0,
    );
    const totalRides = completedRides.length;
    const totalPassengers = completedBookings.length;

    // Today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEarnings = rideEarnings
      .filter((r) => r.ended_at && new Date(r.ended_at) >= today)
      .reduce((sum, r) => sum + r.total_earned, 0);

    // This week earnings
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEarnings = rideEarnings
      .filter((r) => r.ended_at && new Date(r.ended_at) >= weekStart)
      .reduce((sum, r) => sum + r.total_earned, 0);

    // This month earnings
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEarnings = rideEarnings
      .filter((r) => r.ended_at && new Date(r.ended_at) >= monthStart)
      .reduce((sum, r) => sum + r.total_earned, 0);

    // This year earnings
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEarnings = rideEarnings
      .filter((r) => r.ended_at && new Date(r.ended_at) >= yearStart)
      .reduce((sum, r) => sum + r.total_earned, 0);

    const period = String(req.query.period || "all").toLowerCase();
    let filteredRides = rideEarnings;

    if (period === "week") {
      filteredRides = rideEarnings.filter(
        (r) => r.ended_at && new Date(r.ended_at) >= weekStart,
      );
    } else if (period === "month") {
      filteredRides = rideEarnings.filter(
        (r) => r.ended_at && new Date(r.ended_at) >= monthStart,
      );
    } else if (period === "year") {
      filteredRides = rideEarnings.filter(
        (r) => r.ended_at && new Date(r.ended_at) >= yearStart,
      );
    }

    const filteredEarnings = filteredRides.reduce(
      (sum, r) => sum + r.total_earned,
      0,
    );
    const filteredPassengers = filteredRides.reduce(
      (sum, r) => sum + (r.passengers || 0),
      0,
    );

    res.status(200).json({
      success: true,
      data: {
        total_earnings: totalEarnings,
        today_earnings: todayEarnings,
        week_earnings: weekEarnings,
        month_earnings: monthEarnings,
        year_earnings: yearEarnings,
        total_rides: totalRides,
        total_passengers: totalPassengers,
        selected_period: ["week", "month", "year"].includes(period)
          ? period
          : "all",
        filtered_earnings: filteredEarnings,
        filtered_rides: filteredRides.length,
        filtered_passengers: filteredPassengers,
        rides: rideEarnings,
      },
    });
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
  getDriverEarnings,
};
