const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const { getDirections } = require('../services/orsService');
const { calculateFare } = require('../utils/fareCalculator');
const { generateSecureCheckInCode, getCheckInCodeExpiry } = require('../utils/generateCheckInCode');
const { getCachedNearbyRides, cacheNearbyRides, invalidateRideCaches } = require('../services/cacheService');
const { streamDriverLocation, notifyRideStarted, notifyRideCompleted } = require('../services/notificationService');
const { logDriverAction } = require('../services/auditService');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const { buildNearQuery } = require('../utils/geoHelpers');
const appConfig = require('../config/appConfig');
const logger = require('../config/logger');

/**
 * Create a new ride
 */
exports.createRide = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { pickup_location, destination, fare, departure_time, available_seats } = req.body;

    // Verify driver is active
    const driver = await Driver.findById(driverId);
    if (!driver || driver.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Driver account is not active',
      });
    }

    // Get route details from ORS
    let routeData, calculatedFare;
    try {
      routeData = await getDirections(pickup_location.coordinates, destination.coordinates);
    } catch (error) {
      logger.warn(`ORS error for ride creation: ${error.message}`);
      // Continue without route data
    }

    // Calculate fare based on policy
    const fareCalculation = calculateFare({
      distanceMeters: routeData?.distance_meters,
      driverFare: fare,
    });

    // Create ride
    const ride = await Ride.create({
      driver_id: driverId,
      pickup_location: {
        type: 'Point',
        coordinates: pickup_location.coordinates,
        address: pickup_location.address,
      },
      destination: {
        type: 'Point',
        coordinates: destination.coordinates,
        address: destination.address,
      },
      fare: fareCalculation.fare,
      fare_policy_source: fareCalculation.source,
      departure_time,
      available_seats: available_seats || driver.available_seats,
      booked_seats: 0,
      status: 'available',
      route_geometry: routeData?.geometry,
      distance_meters: routeData?.distance_meters,
      duration_seconds: routeData?.duration_seconds,
    });

    await logDriverAction.createRide(driverId, ride._id, {
      pickup: pickup_location.address,
      destination: destination.address,
      fare: ride.fare,
    }, req);

    // Invalidate ride caches
    await invalidateRideCaches();

    logger.info(`Ride created: ${ride._id} by driver ${driverId}`);

    res.status(201).json({
      success: true,
      message: 'Ride created successfully',
      ride,
    });
  } catch (error) {
    logger.error(`Create ride error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create ride',
    });
  }
};

/**
 * Get nearby available rides
 */
exports.getNearbyRides = async (req, res) => {
  try {
    const { longitude, latitude, max_distance } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        error: 'Longitude and latitude are required',
      });
    }

    const location = {
      longitude: parseFloat(longitude),
      latitude: parseFloat(latitude),
    };

    // Check cache
    const cached = await getCachedNearbyRides(location);
    if (cached) {
      return res.status(200).json({
        success: true,
        cached: true,
        rides: cached,
      });
    }

    const maxDistance = max_distance ? parseFloat(max_distance) * 1000 : appConfig.ride.searchRadiusKm * 1000;

    // Query nearby rides
    const rides = await Ride.find({
      status: 'available',
      departure_time: { $gte: new Date() },
      pickup_location: buildNearQuery(location.longitude, location.latitude, maxDistance),
    })
      .populate('driver_id', 'name phone rating vehicle_model plate_number')
      .limit(20)
      .lean();

    // Cache the result
    await cacheNearbyRides(location, rides);

    res.status(200).json({
      success: true,
      cached: false,
      count: rides.length,
      rides,
    });
  } catch (error) {
    logger.error(`Get nearby rides error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch nearby rides',
    });
  }
};

/**
 * Get active rides for current user
 */
exports.getActiveRides = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.userType;

    let rides;
    if (userType === 'driver') {
      rides = await Ride.find({
        driver_id: userId,
        status: { $in: ['available', 'in_progress'] },
      })
        .populate({
          path: 'bookings',
          populate: { path: 'student_id', select: 'matric_no first_name last_name phone' },
        })
        .sort({ departure_time: 1 })
        .lean();
    } else if (userType === 'student') {
      const bookings = await Booking.find({
        student_id: userId,
        status: { $in: ['active', 'accepted', 'in_progress'] },
      })
        .populate({
          path: 'ride_id',
          populate: { path: 'driver_id', select: 'name phone rating vehicle_model plate_number' },
        })
        .lean();

      rides = bookings.map((b) => b.ride_id);
    }

    res.status(200).json({
      success: true,
      count: rides?.length || 0,
      rides,
    });
  } catch (error) {
    logger.error(`Get active rides error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active rides',
    });
  }
};

/**
 * Generate/rotate check-in code
 */
exports.generateCheckInCode = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const ride = await Ride.findOne({ _id: id, driver_id: driverId });
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    // Generate new code
    const code = generateSecureCheckInCode();
    const expiry = getCheckInCodeExpiry(appConfig.ride.checkInCodeExpirySeconds);

    ride.check_in_code = code;
    ride.check_in_code_expiry = expiry;
    await ride.save();

    logger.info(`Check-in code generated for ride ${id}`);

    res.status(200).json({
      success: true,
      message: 'Check-in code generated',
      code,
      expiry,
    });
  } catch (error) {
    logger.error(`Generate check-in code error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate check-in code',
    });
  }
};

/**
 * Start ride
 */
exports.startRide = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const ride = await Ride.findOne({ _id: id, driver_id: driverId });
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    if (ride.status !== 'available') {
      return res.status(400).json({
        success: false,
        error: 'Ride cannot be started',
      });
    }

    ride.status = 'in_progress';
    await ride.save();

    // Get all students in this ride
    const bookings = await Booking.find({ ride_id: id, status: 'accepted' });
    const studentIds = bookings.map((b) => b.student_id.toString());

    // Update booking status
    await Booking.updateMany(
      { ride_id: id, status: 'accepted' },
      { status: 'in_progress' }
    );

    // Notify students
    notifyRideStarted(id, studentIds);

    // Invalidate caches
    await invalidateRideCaches();

    logger.info(`Ride started: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Ride started successfully',
      ride,
    });
  } catch (error) {
    logger.error(`Start ride error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start ride',
    });
  }
};

/**
 * Update driver location during ride
 */
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { longitude, latitude } = req.body;
    const driverId = req.user._id;

    const ride = await Ride.findOne({ _id: id, driver_id: driverId });
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    // Update location
    ride.updateCurrentLocation(longitude, latitude);
    await ride.save();

    // Stream location to students via Socket.io
    streamDriverLocation(id, {
      longitude,
      latitude,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Location updated',
    });
  } catch (error) {
    logger.error(`Update location error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update location',
    });
  }
};

/**
 * End ride
 */
exports.endRide = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const ride = await Ride.findOne({ _id: id, driver_id: driverId });
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    if (ride.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: 'Ride is not in progress',
      });
    }

    ride.status = 'completed';
    ride.ended_at = new Date();
    await ride.save();

    // Get all bookings
    const bookings = await Booking.find({ ride_id: id });

    // Mark checked-in bookings as completed, others as missed
    for (const booking of bookings) {
      if (booking.check_in_status === 'checked_in') {
        booking.status = 'completed';
      } else if (booking.status === 'in_progress') {
        booking.status = 'missed';
      }
      await booking.save();
    }

    const studentIds = bookings.map((b) => b.student_id.toString());

    // Notify all participants
    notifyRideCompleted(id, studentIds, driverId.toString());

    // Update driver statistics
    const driver = await Driver.findById(driverId);
    driver.total_rides += 1;
    await driver.save();

    // Invalidate caches
    await invalidateRideCaches();

    logger.info(`Ride ended: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Ride ended successfully',
      ride,
    });
  } catch (error) {
    logger.error(`End ride error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to end ride',
    });
  }
};

/**
 * Get ride by ID
 */
exports.getRideById = async (req, res) => {
  try {
    const { id } = req.params;

    const ride = await Ride.findById(id)
      .populate('driver_id', 'name phone rating vehicle_model plate_number')
      .populate({
        path: 'bookings',
        populate: { path: 'student_id', select: 'matric_no first_name last_name' },
      })
      .lean();

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    res.status(200).json({
      success: true,
      ride,
    });
  } catch (error) {
    logger.error(`Get ride by ID error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ride',
    });
  }
};

module.exports = exports;
