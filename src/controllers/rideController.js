const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const CampusLocation = require("../models/CampusLocation");
const Driver = require("../models/Driver");
const FarePolicy = require("../models/FarePolicy");
const PlatformSettings = require("../models/PlatformSettings");
const generateCheckInCode = require("../utils/generateCheckInCode");
const notificationService = require("../services/notificationService");
const { getIO } = require("../utils/socketManager");
const User = require("../models/User");
const { sanitizeLatLng } = require("../utils/geo");

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

// ── Create a ride (users request, drivers schedule, admins schedule) ────────
const createRide = async (req, res, next) => {
  try {
    const {
      pickup_location_id,
      destination_id,
      fare,
      departure_time,
      available_seats,
      driver_id,
      seats_requested,
      payment_method,
    } = req.body;

    // Fetch platform settings
    const settings = await PlatformSettings.getSettings();

    // Check maintenance mode
    if (settings.maintenance_mode) {
      return res.status(503).json({
        success: false,
        message:
          "The app is currently under maintenance. Please try again later.",
      });
    }

    const isUser = req.user.role === "user";

    if (isUser) {
      const riderCheck = await ensureUserHasBookingPhone(req.user._id);
      if (!riderCheck.ok) {
        return res.status(riderCheck.status).json({
          success: false,
          message: riderCheck.message,
        });
      }
    }

    // Check allow_ride_without_driver for user-created rides
    if (isUser && !settings.allow_ride_without_driver) {
      return res.status(403).json({
        success: false,
        message:
          "Ride requests are currently disabled. Please check back later.",
      });
    }

    if (!pickup_location_id || !destination_id) {
      return res.status(400).json({
        success: false,
        message: "pickup_location_id and destination_id are required",
      });
    }

    const [pickup, dest] = await Promise.all([
      CampusLocation.findById(pickup_location_id),
      CampusLocation.findById(destination_id),
    ]);

    if (!pickup || !dest) {
      return res.status(404).json({
        success: false,
        message: "One or both campus locations not found",
      });
    }

    const checkInCode = generateCheckInCode();
    const isDriver = req.user.role === "driver";

    // Determine fare — use provided fare or fetch from fare policy
    let rideFare = fare;
    if (!rideFare) {
      try {
        const farePolicy = await FarePolicy.findOne().sort({ updatedAt: -1 });
        rideFare = farePolicy ? farePolicy.minimum_fare || 500 : 500;
      } catch {
        rideFare = 500;
      }
    }

    // Determine seats (capped by platform max_seats_per_booking)
    const seats = Math.min(
      available_seats || 4,
      settings.max_seats_per_booking || 10,
    );
    const userSeats = Math.min(
      seats_requested || 1,
      settings.max_seats_per_booking || 4,
    );

    // Build ride
    const rideData = {
      created_by: req.user._id,
      pickup_location_id: pickup._id,
      destination_id: dest._id,
      pickup_location: {
        type: "Point",
        coordinates: pickup.coordinates.coordinates,
        address: pickup.address || pickup.name,
      },
      destination: {
        type: "Point",
        coordinates: dest.coordinates.coordinates,
        address: dest.address || dest.name,
      },
      fare: rideFare,
      departure_time: departure_time || new Date(),
      available_seats: seats,
      check_in_code: checkInCode,
    };

    if (isUser) {
      // User creates a ride request — no driver, status "available"
      rideData.status = "available";
      rideData.driver_id = null;
      rideData.booked_seats = userSeats;
    } else if (isDriver) {
      // Driver creates own ride — they are the driver
      const driver = await Driver.findOne({ user_id: req.user._id });
      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver profile not found",
        });
      }
      rideData.driver_id = driver._id;
      rideData.status = "scheduled";
    } else {
      // Admin creates ride
      rideData.driver_id = driver_id || null;
      rideData.status = driver_id ? "scheduled" : "available";
    }

    const ride = await Ride.create(rideData);

    // If user created, auto-create a booking for them
    let booking = null;
    if (isUser) {
      booking = await Booking.create({
        ride_id: ride._id,
        user_id: req.user._id,
        seats_requested: userSeats,
        total_fare: settings.fare_per_seat
          ? (rideFare || 0) * userSeats
          : rideFare || 0,
        payment_method: payment_method || "cash",
        status: "pending",
      });
    }

    await ride.populate(["pickup_location_id", "destination_id"]);

    // If driver created a ride, notify users with matching pending ride requests
    if (isDriver) {
      try {
        const matchingRequests = await Ride.find({
          status: "available",
          driver_id: null,
          pickup_location_id: pickup._id,
          destination_id: dest._id,
          departure_time: { $gte: new Date() },
        }).select("_id");

        if (matchingRequests.length > 0) {
          const requestIds = matchingRequests.map((r) => r._id);
          const matchingBookings = await Booking.find({
            ride_id: { $in: requestIds },
            status: "pending",
          }).select("user_id");

          const notifiedUsers = new Set();
          for (const b of matchingBookings) {
            const uid = b.user_id.toString();
            if (!notifiedUsers.has(uid)) {
              notifiedUsers.add(uid);
              notificationService.notifyMatchingRideAvailable(uid, {
                ride_id: ride._id.toString(),
                pickup: pickup.name || pickup.address,
                destination: dest.name || dest.address,
                departure_time: ride.departure_time,
                fare: ride.fare,
              });
            }
          }
        }
      } catch (e) {
        console.error("Matching ride notification error:", e.message);
      }
    }

    // Emit socket events for real-time updates
    try {
      const io = getIO();
      if (isUser) {
        // Notify all online drivers about the new ride request
        io.to("driver-feed").emit("ride:new_request", ride.toObject());
      }
      // Notify the creator's personal feed
      io.to(`user-feed-${req.user._id}`).emit("ride:created", ride.toObject());
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res.status(201).json({
      success: true,
      message: isUser
        ? "Ride request created! Waiting for a driver to accept."
        : "Ride created successfully",
      data: { ride, booking },
    });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Accept/claim an available ride ──────────────────────────────────
const acceptRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }

    if (ride.status !== "available") {
      return res.status(400).json({
        success: false,
        message: "This ride is no longer available",
      });
    }

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });
    }

    if (driver.application_status !== "approved") {
      return res
        .status(403)
        .json({ success: false, message: "Driver not approved" });
    }

    // Assign driver and update status
    ride.driver_id = driver._id;
    ride.status = "accepted";
    await ride.save();

    // Auto-confirm all pending bookings on this ride
    const pendingBookings = await Booking.find({
      ride_id: ride._id,
      status: "pending",
    }).populate("user_id", "name email");

    for (const booking of pendingBookings) {
      booking.status = "accepted";
      booking.reviewed_by = req.user._id;
      booking.reviewed_at = new Date();
      await booking.save();

      // Notify the passenger
      try {
        const passengerId = (
          booking.user_id?._id || booking.user_id
        ).toString();

        // Ride creator gets "Driver Found!" — other passengers get "Ride Confirmed"
        const isCreator =
          ride.created_by && passengerId === ride.created_by.toString();

        if (isCreator) {
          notificationService.notifyRideAccepted(passengerId, {
            name: req.user.name || "Your driver",
            ride_id: ride._id.toString(),
            pickup: ride.pickup_location_id?.name || "pickup",
            destination: ride.destination_id?.name || "destination",
            departure_time: ride.departure_time,
          });
        } else {
          const totalFare =
            booking.total_fare || (ride.fare || 0) * booking.seats_requested;
          notificationService.notifyBookingConfirmed(passengerId, {
            ride_id: ride._id,
            pickup: ride.pickup_location_id?.name || "pickup",
            destination: ride.destination_id?.name || "destination",
            departure_time: ride.departure_time,
            fare: totalFare,
            fare_per_seat: ride.fare,
            seats: booking.seats_requested,
          });
        }
      } catch (err) {
        console.log("Notification failed (non-critical):", err.message);
      }
    }

    await ride.populate([
      "pickup_location_id",
      "destination_id",
      {
        path: "driver_id",
        populate: { path: "user_id", select: "name profile_picture" },
      },
    ]);

    // Emit socket events for real-time updates
    try {
      const io = getIO();
      const rideObj = ride.toObject();
      // Notify all drivers that this ride was claimed (remove from their feed)
      io.to("driver-feed").emit("ride:accepted", {
        ride_id: ride._id.toString(),
        ride: rideObj,
      });
      // Notify the ride creator (user) that their ride was accepted
      if (ride.created_by) {
        io.to(`user-feed-${ride.created_by}`).emit("ride:accepted", {
          ride_id: ride._id.toString(),
          ride: rideObj,
          check_in_code: ride.check_in_code,
        });
      }
      // Notify all users who booked this ride
      for (const booking of pendingBookings) {
        if (booking.user_id?._id) {
          io.to(`user-feed-${booking.user_id._id}`).emit("booking:updated", {
            booking_id: booking._id.toString(),
            status: "accepted",
            ride_id: ride._id.toString(),
            check_in_code: ride.check_in_code,
          });
        }
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res.status(200).json({
      success: true,
      message: "Ride accepted! You are now the driver for this trip.",
      data: ride,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET available rides (for users — upcoming + available rides) ─────────────
const getActiveRides = async (req, res, next) => {
  try {
    const { pickup, destination } = req.query;
    const filter = {
      status: { $in: ["scheduled", "available", "accepted"] },
      departure_time: { $gt: new Date() }, // Only show rides that haven't departed yet
    };

    if (pickup) filter.pickup_location_id = pickup;
    if (destination) filter.destination_id = destination;

    const rides = await Ride.find(filter)
      .populate("pickup_location_id")
      .populate("destination_id")
      .populate({
        path: "driver_id",
        select:
          "user_id vehicle_model vehicle_color plate_number available_seats rating is_online",
        populate: { path: "user_id", select: "name profile_picture" },
      })
      .sort({ departure_time: 1 });

    const data = rides
      .filter((r) => {
        // Hide scheduled rides whose driver is offline (not accepting rides)
        if (r.status === "scheduled" && r.driver_id && !r.driver_id.is_online) {
          return false;
        }
        return true;
      })
      .map((r) => {
        const obj = r.toObject();
        obj.seats_remaining = r.available_seats - r.booked_seats;
        return obj;
      });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

// ── GET single ride detail ──────────────────────────────────────────────────
const getRideDetails = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("pickup_location_id")
      .populate("destination_id")
      .populate("created_by", "name profile_picture phone")
      .populate({
        path: "driver_id",
        select:
          "user_id vehicle_model vehicle_color plate_number rating bank_name bank_account_name bank_account_number",
        populate: {
          path: "user_id",
          select: "name profile_picture email phone",
        },
      });

    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    const bookings = await Booking.find({
      ride_id: ride._id,
      status: { $in: ["pending", "accepted", "in_progress"] },
    }).populate(
      "user_id",
      "name email profile_picture phone current_location updatedAt",
    );

    const obj = ride.toObject();
    obj.seats_remaining = ride.available_seats - ride.booked_seats;
    obj.bookings = bookings;

    res.status(200).json({ success: true, data: obj });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Get all rides ────────────────────────────────────────────────────
const getAllRides = async (req, res, next) => {
  try {
    const { status, driver_id, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (driver_id) filter.driver_id = driver_id;

    const rides = await Ride.find(filter)
      .populate("pickup_location_id")
      .populate("destination_id")
      .populate({
        path: "driver_id",
        populate: { path: "user_id", select: "name" },
      })
      .sort({ departure_time: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Ride.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: rides.length,
      total,
      page: Number(page),
      data: rides,
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Update ride ──────────────────────────────────────────────────────
const updateRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    const { fare, departure_time, available_seats, driver_id, status } =
      req.body;

    if (fare !== undefined) ride.fare = fare;
    if (departure_time !== undefined) ride.departure_time = departure_time;
    if (available_seats !== undefined) ride.available_seats = available_seats;
    if (driver_id !== undefined) ride.driver_id = driver_id;
    if (status !== undefined) ride.status = status;

    await ride.save();
    await ride.populate(["pickup_location_id", "destination_id"]);

    res
      .status(200)
      .json({ success: true, message: "Ride updated", data: ride });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Cancel ride ──────────────────────────────────────────────────────
const cancelRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    ride.status = "cancelled";
    await ride.save();

    // Find all affected bookings before bulk cancelling
    const affectedBookings = await Booking.find({
      ride_id: ride._id,
      status: { $in: ["pending", "accepted"] },
    }).select("user_id");

    await Booking.updateMany(
      { ride_id: ride._id, status: { $in: ["pending", "accepted"] } },
      { status: "cancelled" },
    );

    // Notify all affected users about ride cancellation
    for (const b of affectedBookings) {
      notificationService.notifyRideCancellation(b.user_id.toString(), "user", {
        ride_id: ride._id.toString(),
      });
    }

    // Notify driver if assigned
    if (ride.driver_id) {
      const driver = await Driver.findById(ride.driver_id).select("user_id");
      if (driver) {
        notificationService.notifyRideCancellation(
          driver.user_id.toString(),
          "driver",
          { ride_id: ride._id.toString() },
        );
      }
    }

    res.status(200).json({ success: true, message: "Ride cancelled" });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Update GPS location during ride ─────────────────────────────────
const updateDriverLocation = async (req, res, next) => {
  try {
    const safeLocation = sanitizeLatLng(req.body.latitude, req.body.longitude);
    const ride = await Ride.findById(req.params.id);
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (
      !driver ||
      !ride.driver_id ||
      ride.driver_id.toString() !== driver._id.toString()
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (!safeLocation) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    ride.current_location = {
      type: "Point",
      coordinates: [safeLocation.longitude, safeLocation.latitude],
    };
    await ride.save();

    res.status(200).json({ success: true, message: "Location updated" });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Start ride (transition to in_progress) ──────────────────────────
const startRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (
      !driver ||
      !ride.driver_id ||
      ride.driver_id.toString() !== driver._id.toString()
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (ride.status === "in_progress") {
      // Already started — just return success
      return res
        .status(200)
        .json({ success: true, message: "Ride already started", data: ride });
    }

    if (!["accepted", "available", "scheduled"].includes(ride.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start ride with status: ${ride.status}`,
      });
    }

    // Require at least one checked-in passenger
    const checkedIn = await Booking.countDocuments({
      ride_id: ride._id,
      status: "accepted",
      check_in_status: "checked_in",
    });
    if (checkedIn === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one passenger must check in before starting",
      });
    }

    ride.status = "in_progress";
    await ride.save();

    // Update all accepted bookings to in_progress
    await Booking.updateMany(
      { ride_id: ride._id, status: "accepted" },
      { status: "in_progress" },
    );

    // Emit socket events
    try {
      const io = getIO();
      io.to(`ride-${ride._id}`).emit("ride:started", {
        ride_id: ride._id.toString(),
      });
      // Notify all passengers
      const rideBookings = await Booking.find({
        ride_id: ride._id,
        status: "in_progress",
      }).select("user_id");
      for (const b of rideBookings) {
        io.to(`user-feed-${b.user_id}`).emit("ride:started", {
          ride_id: ride._id.toString(),
        });
        notificationService.createAndPush(
          b.user_id.toString(),
          "Ride Started 🚗",
          "Your driver has started the trip. Enjoy the ride!",
          "ride",
          { action: "ride_started", ride_id: ride._id.toString() },
        );
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res
      .status(200)
      .json({ success: true, message: "Ride started", data: ride });
  } catch (error) {
    next(error);
  }
};

// ── Driver: End ride ────────────────────────────────────────────────────────
const endRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride)
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (
      !driver ||
      !ride.driver_id ||
      ride.driver_id.toString() !== driver._id.toString()
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (ride.status === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Ride already completed" });
    }

    ride.status = "completed";
    ride.ended_at = new Date();
    await ride.save();

    await Booking.updateMany(
      { ride_id: ride._id, status: { $in: ["accepted", "in_progress"] } },
      { status: "completed" },
    );

    // Emit socket events
    try {
      const io = getIO();
      io.to(`ride-${ride._id}`).emit("ride:ended", {
        ride_id: ride._id.toString(),
      });
      // Notify all users with bookings on this ride
      const rideBookings = await Booking.find({ ride_id: ride._id }).select(
        "user_id",
      );
      const notifiedPassengers = new Set();
      for (const b of rideBookings) {
        const passengerId = b.user_id.toString();
        io.to(`user-feed-${passengerId}`).emit("ride:ended", {
          ride_id: ride._id.toString(),
        });
        // Send push + in-app notification to each passenger ONCE
        if (!notifiedPassengers.has(passengerId)) {
          notifiedPassengers.add(passengerId);
          notificationService.notifyRideEnded(
            passengerId,
            null, // driver notified separately below
            { _id: ride._id.toString() },
          );
        }
      }
      // Notify the driver once (not per-booking)
      if (driver?.user_id) {
        notificationService.createAndPush(
          driver.user_id.toString(),
          "Trip Complete ✅",
          "Nice work! You've successfully completed a trip. Your earnings will be updated shortly.",
          "ride",
          { action: "ride_completed", ride_id: ride._id.toString() },
        );
      }
    } catch (e) {
      console.log("Socket emit failed (non-critical):", e.message);
    }

    res.status(200).json({ success: true, message: "Ride ended", data: ride });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Get my rides ────────────────────────────────────────────────────
const getMyRides = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });

    const rides = await Ride.find({ driver_id: driver._id })
      .populate("pickup_location_id")
      .populate("destination_id")
      .sort({ departure_time: -1 })
      .limit(50);

    res.status(200).json({ success: true, count: rides.length, data: rides });
  } catch (error) {
    next(error);
  }
};

// ── Driver: Get available ride requests (no driver yet) ─────────────────────
const getAvailableRequests = async (req, res, next) => {
  try {
    const rides = await Ride.find({ status: "available", driver_id: null })
      .populate("pickup_location_id")
      .populate("destination_id")
      .populate({ path: "created_by", select: "name profile_picture" })
      .sort({ createdAt: -1 })
      .limit(50);

    const data = rides.map((r) => {
      const obj = r.toObject();
      obj.seats_remaining = r.available_seats - r.booked_seats;
      return obj;
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRide,
  getActiveRides,
  getRideDetails,
  getAllRides,
  updateRide,
  cancelRide,
  updateDriverLocation,
  startRide,
  endRide,
  getMyRides,
  acceptRide,
  getAvailableRequests,
};
