const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const Student = require('../models/Student');
const Driver = require('../models/Driver');
const { sendBookingConfirmationEmail, sendRideCompletionEmail, sendMissedRideAlertEmail } = require('../services/emailService');
const { notifyBookingCreated, notifyBookingAccepted } = require('../services/notificationService');
const { invalidateRideCaches } = require('../services/cacheService');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * Create a new booking
 */
exports.createBooking = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { ride_id } = req.body;

    // Check if ride exists and is available
    const ride = await Ride.findById(ride_id);
    if (!ride) {
      return res.status(404).json({
        success: false,
        error: 'Ride not found',
      });
    }

    if (ride.status !== 'available') {
      return res.status(400).json({
        success: false,
        error: 'Ride is not available for booking',
      });
    }

    // Check if student already has a booking for this ride
    const existingBooking = await Booking.findOne({ student_id: studentId, ride_id });
    if (existingBooking) {
      return res.status(400).json({
        success: false,
        error: 'You have already booked this ride',
      });
    }

    // Check if seats are available
    if (ride.isFull()) {
      return res.status(400).json({
        success: false,
        error: 'No available seats for this ride',
      });
    }

    // Check if student has another active booking
    const activeBooking = await Booking.findOne({
      student_id: studentId,
      status: { $in: ['active', 'accepted', 'in_progress'] },
    });

    if (activeBooking) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active booking',
      });
    }

    // Create booking (atomic operation)
    const session = await Booking.startSession();
    session.startTransaction();

    try {
      // Increment booked seats
      const updatedRide = await Ride.findByIdAndUpdate(
        ride_id,
        { $inc: { booked_seats: 1 } },
        { new: true, session }
      );

      if (updatedRide.booked_seats > updatedRide.available_seats) {
        throw new Error('No seats available');
      }

      // Create booking
      const booking = await Booking.create([{
        student_id: studentId,
        ride_id,
        fare: ride.fare,
        status: 'active',
        payment_status: 'pending',
      }], { session });

      await session.commitTransaction();

      // Add booking to student's history
      await Student.findByIdAndUpdate(studentId, {
        $push: { ride_history: booking[0]._id },
      });

      // Populate booking details
      const populatedBooking = await Booking.findById(booking[0]._id)
        .populate('ride_id')
        .populate('student_id', 'matric_no first_name last_name')
        .lean();

      // Notify driver
      notifyBookingCreated(ride.driver_id.toString(), populatedBooking);

      // Send confirmation email
      const student = await Student.findById(studentId).lean();
      const driver = await Driver.findById(ride.driver_id).lean();
      
      try {
        await sendBookingConfirmationEmail({
          studentEmail: student.email,
          studentName: `${student.first_name} ${student.last_name}`,
          driverName: driver.name,
          pickup: ride.pickup_location.address,
          destination: ride.destination.address,
          departureTime: ride.departure_time,
          fare: ride.fare,
        });
      } catch (emailError) {
        logger.warn(`Failed to send booking confirmation email: ${emailError.message}`);
      }

      // Invalidate ride caches
      await invalidateRideCaches();

      logger.info(`Booking created: ${booking[0]._id} for ride ${ride_id}`);

      res.status(201).json({
        success: true,
        message: 'Booking created successfully',
        booking: populatedBooking,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error(`Create booking error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create booking',
    });
  }
};

/**
 * Confirm booking (driver accepts)
 */
exports.confirmBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user._id;

    const booking = await Booking.findById(id)
      .populate('ride_id')
      .populate('student_id', 'email first_name last_name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    // Verify driver owns this ride
    if (booking.ride_id.driver_id.toString() !== driverId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Booking cannot be confirmed',
      });
    }

    booking.status = 'accepted';
    await booking.save();

    // Get driver bank details to expose to student
    const driver = await Driver.findById(driverId).select('bank_details name phone vehicle_model plate_number');

    // Notify student
    notifyBookingAccepted(booking.student_id._id.toString(), {
      bookingId: booking._id,
      rideId: booking.ride_id._id,
      driverDetails: driver,
    });

    logger.info(`Booking confirmed: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Booking confirmed',
      booking,
      driver_bank_details: driver.bank_details,
    });
  } catch (error) {
    logger.error(`Confirm booking error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm booking',
    });
  }
};

/**
 * Check-in with 4-digit code
 */
exports.checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const { check_in_code } = req.body;
    const studentId = req.user._id;

    const booking = await Booking.findOne({ _id: id, student_id: studentId })
      .populate('ride_id');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    if (booking.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: 'Ride has not started yet',
      });
    }

    const ride = booking.ride_id;

    // Validate check-in code
    if (!ride.check_in_code || ride.check_in_code !== check_in_code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid check-in code',
      });
    }

    // Check code expiry
    if (ride.check_in_code_expiry && new Date() > ride.check_in_code_expiry) {
      return res.status(400).json({
        success: false,
        error: 'Check-in code has expired',
      });
    }

    // Mark as checked-in
    booking.check_in_status = 'checked_in';
    booking.check_in_time = new Date();
    await booking.save();

    logger.info(`Student checked in: booking ${id}`);

    res.status(200).json({
      success: true,
      message: 'Checked in successfully',
      booking,
    });
  } catch (error) {
    logger.error(`Check-in error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to check in',
    });
  }
};

/**
 * Update payment status
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method } = req.body;
    const studentId = req.user._id;

    const booking = await Booking.findOne({ _id: id, student_id: studentId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    if (!['cash', 'transfer'].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method',
      });
    }

    booking.payment_method = payment_method;
    booking.payment_status = 'paid';
    await booking.save();

    logger.info(`Payment updated: booking ${id}, method: ${payment_method}`);

    res.status(200).json({
      success: true,
      message: 'Payment status updated',
      booking,
    });
  } catch (error) {
    logger.error(`Update payment error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment status',
    });
  }
};

/**
 * Add rating and review
 */
exports.addRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const studentId = req.user._id;

    const booking = await Booking.findOne({ _id: id, student_id: studentId })
      .populate('ride_id');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Can only rate completed rides',
      });
    }

    if (booking.rating) {
      return res.status(400).json({
        success: false,
        error: 'You have already rated this ride',
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5',
      });
    }

    booking.rating = rating;
    booking.review = review;
    await booking.save();

    // Update driver's average rating
    const driverId = booking.ride_id.driver_id;
    const completedBookings = await Booking.find({
      ride_id: { $in: await Ride.find({ driver_id: driverId }).distinct('_id') },
      rating: { $exists: true, $ne: null },
    });

    const avgRating = completedBookings.reduce((acc, b) => acc + b.rating, 0) / completedBookings.length;
    
    await Driver.findByIdAndUpdate(driverId, {
      rating: avgRating.toFixed(2),
    });

    logger.info(`Rating added: booking ${id}, rating: ${rating}`);

    res.status(200).json({
      success: true,
      message: 'Rating submitted successfully',
      booking,
    });
  } catch (error) {
    logger.error(`Add rating error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to add rating',
    });
  }
};

/**
 * Cancel booking
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const booking = await Booking.findOne({ _id: id, student_id: studentId })
      .populate('ride_id');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    if (!['active', 'accepted'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel this booking',
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // Decrement booked seats
    await Ride.findByIdAndUpdate(booking.ride_id._id, {
      $inc: { booked_seats: -1 },
    });

    // Invalidate caches
    await invalidateRideCaches();

    logger.info(`Booking cancelled: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    logger.error(`Cancel booking error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking',
    });
  }
};

/**
 * Get booking by ID
 */
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userType = req.userType;

    const query = { _id: id };
    
    // Students can only see their own bookings
    if (userType === 'student') {
      query.student_id = userId;
    }

    const booking = await Booking.findOne(query)
      .populate('student_id', 'matric_no first_name last_name email phone')
      .populate({
        path: 'ride_id',
        populate: { path: 'driver_id', select: 'name phone rating vehicle_model plate_number bank_details' },
      })
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    // Hide bank details unless booking is accepted
    if (userType === 'student' && booking.status !== 'accepted' && booking.status !== 'in_progress') {
      delete booking.ride_id.driver_id.bank_details;
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    logger.error(`Get booking error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking',
    });
  }
};

/**
 * Get user bookings with pagination
 */
exports.getMyBookings = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { status } = req.query;
    const { page, limit, skip } = getPaginationParams(req);

    const query = { student_id: studentId };
    if (status) {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate({
        path: 'ride_id',
        populate: { path: 'driver_id', select: 'name phone rating vehicle_model plate_number' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      ...createPaginationResponse(bookings, total, page, limit),
    });
  } catch (error) {
    logger.error(`Get bookings error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings',
    });
  }
};

module.exports = exports;
