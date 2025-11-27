const Booking = require("../models/Booking");
const Ride = require("../models/Ride");
const Driver = require("../models/Driver");
const User = require("../models/User");
const {
  notifyRideAccepted,
  notifyBookingConfirmed,
} = require("../services/notificationService");
const { sendRideConfirmationEmail } = require("../services/emailService");

/**
 * @swagger
 * /api/booking/request:
 *   post:
 *     summary: Request a ride booking
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ride_id
 *               - payment_method
 *             properties:
 *               ride_id:
 *                 type: string
 *               payment_method:
 *                 type: string
 *                 enum: [cash, transfer]
 *     responses:
 *       201:
 *         description: Booking request created
 */
const requestRide = async (req, res, next) => {
  try {
    const { ride_id, payment_method } = req.body;

    // Validate payment method
    if (!["cash", "transfer"].includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Use "cash" or "transfer"',
      });
    }

    // Get ride
    const ride = await Ride.findById(ride_id).populate({
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

    // Check if ride is available
    if (ride.status !== "available") {
      return res.status(400).json({
        success: false,
        message: "Ride is not available for booking",
      });
    }

    // Check if seats available
    if (ride.available_seats <= ride.booked_seats) {
      return res.status(400).json({
        success: false,
        message: "No seats available for this ride",
      });
    }

    // Check if user already has a booking for this ride
    const existingBooking = await Booking.findOne({
      ride_id,
      user_id: req.user._id,
      status: { $in: ["active", "accepted", "in_progress"] },
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "You already have a booking for this ride",
      });
    }

    // Create booking
    const booking = await Booking.create({
      ride_id,
      user_id: req.user._id,
      payment_method,
      status: "active",
    });

    // Increment booked seats
    ride.booked_seats += 1;
    await ride.save();

    // Populate booking for response
    await booking.populate("ride_id");

    res.status(201).json({
      success: true,
      message: "Ride booking requested. Waiting for driver confirmation.",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/booking/confirm/{id}:
 *   post:
 *     summary: Confirm booking (Driver accepts)
 *     tags: [Booking]
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
 *         description: Booking confirmed
 */
const confirmBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user_id")
      .populate({
        path: "ride_id",
        populate: {
          path: "driver_id",
        },
      });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Verify driver owns this ride
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (
      !driver ||
      booking.ride_id.driver_id._id.toString() !== driver._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to confirm this booking",
      });
    }

    if (booking.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    // Update booking status
    booking.status = "accepted";
    booking.bank_details_visible = true; // Make bank details visible
    await booking.save();

    // Update ride status if this is the first acceptance
    const ride = await Ride.findById(booking.ride_id._id);
    if (ride.status === "available") {
      ride.status = "accepted";
      await ride.save();
    }

    // Notify user
    notifyRideAccepted(booking.user_id._id.toString(), {
      driver_name: req.user.name,
      vehicle: driver.vehicle_model,
      plate_number: driver.plate_number,
      phone: driver.phone,
    });

    // Send confirmation email with bank details if transfer
    const bankDetails =
      booking.payment_method === "transfer"
        ? {
            bankName: driver.bank_name || "Not provided",
            accountNumber: driver.bank_account_number || "Not provided",
            accountName: driver.bank_account_name || "Not provided",
          }
        : null;

    try {
      await sendRideConfirmationEmail({
        userName: booking.user_id.name,
        userEmail: booking.user_id.email,
        driverName: req.user.name,
        vehicleModel: driver.vehicle_model,
        plateNumber: driver.plate_number,
        driverRating: driver.rating,
        pickupLocation: ride.pickup_location.address,
        destination: ride.destination.address,
        departureTime: ride.departure_time.toLocaleString(),
        fare: ride.fare,
        paymentMethod: booking.payment_method,
        checkInCode: ride.check_in_code,
        bankDetails,
      });
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError.message);
    }

    res.status(200).json({
      success: true,
      message: "Booking confirmed successfully",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/booking/checkin:
 *   post:
 *     summary: Check in to ride with 4-digit code
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - check_in_code
 *             properties:
 *               booking_id:
 *                 type: string
 *               check_in_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Check-in successful
 */
const checkInRide = async (req, res, next) => {
  try {
    const { booking_id, check_in_code } = req.body;

    const booking = await Booking.findById(booking_id).populate("ride_id");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Verify user owns this booking
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Verify booking is accepted
    if (booking.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Booking must be accepted before check-in",
      });
    }

    // Verify check-in code
    if (booking.ride_id.check_in_code !== check_in_code) {
      return res.status(400).json({
        success: false,
        message: "Invalid check-in code",
      });
    }

    // Update booking
    booking.check_in_status = "checked_in";
    booking.status = "in_progress";
    await booking.save();

    // Update ride status
    const ride = await Ride.findById(booking.ride_id._id);
    ride.status = "in_progress";
    await ride.save();

    res.status(200).json({
      success: true,
      message: "Check-in successful. Ride in progress.",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/booking/payment-status:
 *   patch:
 *     summary: Update payment status
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - payment_status
 *             properties:
 *               booking_id:
 *                 type: string
 *               payment_status:
 *                 type: string
 *                 enum: [pending, paid, not_applicable]
 *     responses:
 *       200:
 *         description: Payment status updated
 */
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { booking_id, payment_status } = req.body;

    const booking = await Booking.findById(booking_id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

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

/**
 * @swagger
 * /api/booking/rate:
 *   post:
 *     summary: Rate driver after ride completion
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - booking_id
 *               - rating
 *             properties:
 *               booking_id:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rating submitted successfully
 */
const rateDriver = async (req, res, next) => {
  try {
    const { booking_id, rating, feedback } = req.body;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const booking = await Booking.findById(booking_id).populate("ride_id");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Verify user owns this booking
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Verify ride is completed
    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only rate completed rides",
      });
    }

    // Check if already rated
    if (booking.rating) {
      return res.status(400).json({
        success: false,
        message: "You have already rated this ride",
      });
    }

    // Update booking
    booking.rating = rating;
    booking.feedback = feedback;
    await booking.save();

    // Update driver rating
    const driver = await Driver.findById(booking.ride_id.driver_id);
    await driver.updateRating(rating);

    res.status(200).json({
      success: true,
      message: "Thank you for your rating!",
      data: {
        rating,
        driver_rating: driver.rating,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/booking/my-bookings:
 *   get:
 *     summary: Get user's bookings
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookings retrieved
 */
const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user_id: req.user._id })
      .populate({
        path: "ride_id",
        populate: {
          path: "driver_id",
          populate: {
            path: "user_id",
            select: "name email",
          },
        },
      })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/booking/cancel/{id}:
 *   patch:
 *     summary: Cancel booking
 *     tags: [Booking]
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
 *         description: Booking cancelled
 */
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("ride_id");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Verify user owns this booking
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Can't cancel completed rides
    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel completed rides",
      });
    }

    // Update booking
    booking.status = "cancelled";
    await booking.save();

    // Decrease booked seats
    const ride = await Ride.findById(booking.ride_id._id);
    if (ride.booked_seats > 0) {
      ride.booked_seats -= 1;
      await ride.save();
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestRide,
  confirmBooking,
  checkInRide,
  updatePaymentStatus,
  rateDriver,
  getMyBookings,
  cancelBooking,
};
