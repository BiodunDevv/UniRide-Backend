const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");
const generateCheckInCode = require("../utils/generateCheckInCode");
const { calculateRoute } = require("../services/routeService");
const { calculateFare } = require("../utils/fareCalculator");
const notificationService = require("../services/notificationService");

/**
 * @swagger
 * /api/rides:
 *   post:
 *     summary: Create new ride (Driver only)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickup_location
 *               - destination
 *               - departure_time
 *               - available_seats
 *             properties:
 *               pickup_location:
 *                 type: object
 *               destination:
 *                 type: object
 *               fare:
 *                 type: number
 *               departure_time:
 *                 type: string
 *               available_seats:
 *                 type: number
 *     responses:
 *       201:
 *         description: Ride created successfully
 */
const createRide = async (req, res, next) => {
  try {
    const {
      pickup_location,
      destination,
      fare,
      departure_time,
      available_seats,
    } = req.body;

    // Get driver profile
    const driver = await Driver.findOne({ user_id: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    if (driver.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Driver must be active to create rides",
      });
    }

    // Calculate route
    const routeData = await calculateRoute(pickup_location, destination);

    // Calculate fare if not provided
    let finalFare = fare;
    let fareSource = "driver";

    if (!fare) {
      finalFare = await calculateFare(
        routeData.distance_meters,
        routeData.duration_seconds
      );
      fareSource = "distance_auto";
    }

    // Generate check-in code
    const checkInCode = generateCheckInCode();

    // Create ride
    const ride = await Ride.create({
      driver_id: driver._id,
      pickup_location: {
        type: "Point",
        coordinates: routeData.pickup.coordinates,
        address: routeData.pickup.address,
      },
      destination: {
        type: "Point",
        coordinates: routeData.destination.coordinates,
        address: routeData.destination.address,
      },
      fare: finalFare,
      fare_policy_source: fareSource,
      departure_time,
      available_seats: available_seats || driver.available_seats,
      route_geometry: routeData.route_geometry,
      distance_meters: routeData.distance_meters,
      duration_seconds: routeData.duration_seconds,
      check_in_code: checkInCode,
      status: "available",
    });

    // Notify available drivers (in this case, notify users looking for rides)
    notificationService.notifyAvailableDrivers(ride);

    res.status(201).json({
      success: true,
      message: "Ride created successfully",
      data: ride,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rides/active:
 *   get:
 *     summary: Get all active rides
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active rides retrieved
 */
const getActiveRides = async (req, res, next) => {
  try {
    const rides = await Ride.find({
      status: "available",
      departure_time: { $gte: new Date() },
      available_seats: { $gt: 0 },
    })
      .populate({
        path: "driver_id",
        populate: {
          path: "user_id",
          select: "name email",
        },
      })
      .sort({ departure_time: 1 });

    res.status(200).json({
      success: true,
      count: rides.length,
      data: rides,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get ride details
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ride details retrieved
 */
const getRideDetails = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id).populate({
      path: "driver_id",
      populate: {
        path: "user_id",
        select: "name email",
      },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    res.status(200).json({
      success: true,
      data: ride,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rides/{id}/location:
 *   post:
 *     summary: Update driver GPS location during ride
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 */
const updateDriverLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Verify driver owns this ride
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver || ride.driver_id.toString() !== driver._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this ride",
      });
    }

    // Update current location
    ride.current_location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
    await ride.save();

    // Get all bookings for this ride to notify users
    const bookings = await Booking.find({
      ride_id: ride._id,
      status: { $in: ["accepted", "in_progress"] },
    });

    // Broadcast location to all booked users
    const { calculateETA } = require("../services/routeService");

    for (const booking of bookings) {
      try {
        const eta = await calculateETA(
          [longitude, latitude],
          ride.destination.coordinates
        );

        const notificationService = require("../services/notificationService");
        notificationService.updateDriverLocation(booking.user_id.toString(), {
          latitude,
          longitude,
          eta_minutes: eta.eta_minutes,
          distance_meters: eta.distance_meters,
        });
      } catch (error) {
        console.error("Error calculating ETA:", error.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rides/{id}/end:
 *   post:
 *     summary: End ride (Driver only)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ride ended successfully
 */
const endRide = async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found",
      });
    }

    // Verify driver owns this ride
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver || ride.driver_id.toString() !== driver._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to end this ride",
      });
    }

    if (ride.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Ride already completed",
      });
    }

    // Update ride status
    ride.status = "completed";
    ride.ended_at = new Date();
    await ride.save();

    // Update all bookings for this ride
    await Booking.updateMany(
      { ride_id: ride._id, status: { $in: ["accepted", "in_progress"] } },
      { status: "completed" }
    );

    // Get all bookings to notify users and send emails
    const bookings = await Booking.find({ ride_id: ride._id }).populate(
      "user_id"
    );
    const { sendRideCompletionEmail } = require("../services/emailService");

    for (const booking of bookings) {
      // Notify via Socket.io
      notificationService.notifyRideEnded(
        booking.user_id._id.toString(),
        driver._id.toString(),
        {
          ride_id: ride._id,
          fare: ride.fare,
          distance_meters: ride.distance_meters,
          duration_seconds: ride.duration_seconds,
        }
      );

      // Send completion email
      try {
        await sendRideCompletionEmail({
          userName: booking.user_id.name,
          userEmail: booking.user_id.email,
          driverName: req.user.name,
          vehicleModel: driver.vehicle_model,
          plateNumber: driver.plate_number,
          pickupLocation: ride.pickup_location.address,
          destination: ride.destination.address,
          distance: (ride.distance_meters / 1000).toFixed(2),
          duration: Math.ceil(ride.duration_seconds / 60),
          dateTime: new Date().toLocaleString(),
          fare: ride.fare,
          paymentMethod: booking.payment_method,
        });
      } catch (emailError) {
        console.error("Error sending completion email:", emailError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Ride ended successfully",
      data: ride,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rides/my-rides:
 *   get:
 *     summary: Get driver's rides
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver rides retrieved
 */
const getMyRides = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    const rides = await Ride.find({ driver_id: driver._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: rides.length,
      data: rides,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRide,
  getActiveRides,
  getRideDetails,
  updateDriverLocation,
  endRide,
  getMyRides,
};
