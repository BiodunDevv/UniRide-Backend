const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/bookingController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   - name: Bookings
 *     description: Booking management — request, cancel, check-in, payment, ratings
 */

/**
 * @swagger
 * /api/booking/request:
 *   post:
 *     tags: [Bookings]
 *     summary: Request a ride (User)
 *     description: Creates a pending booking on an existing ride.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ride_id, payment_method]
 *             properties:
 *               ride_id: { type: string }
 *               payment_method: { type: string, enum: [cash, transfer] }
 *               seats_requested: { type: integer, default: 1 }
 *     responses:
 *       201: { description: Booking created }
 *       400: { description: Validation error or no seats available }
 */
router.post("/request", protect, authorize("user"), apiLimiter, requestRide);

/**
 * @swagger
 * /api/booking/checkin:
 *   post:
 *     tags: [Bookings]
 *     summary: Check in to a ride (User)
 *     description: User checks in using the ride's check-in code. Sets check_in_status to checked_in.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id, check_in_code]
 *             properties:
 *               booking_id: { type: string }
 *               check_in_code: { type: string }
 *     responses:
 *       200: { description: Checked in successfully }
 *       400: { description: Invalid code or booking not accepted }
 */
router.post("/checkin", protect, authorize("user"), checkInRide);

/**
 * @swagger
 * /api/booking/rate:
 *   post:
 *     tags: [Bookings]
 *     summary: Rate a driver (User)
 *     description: User rates the driver after a completed ride (1-5 stars).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id, rating]
 *             properties:
 *               booking_id: { type: string }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               feedback: { type: string }
 *     responses:
 *       200: { description: Rating submitted }
 */
router.post("/rate", protect, authorize("user"), rateDriver);

/**
 * @swagger
 * /api/booking/my-bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: Get my bookings
 *     description: Returns up to 50 bookings for the authenticated user, newest first.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User's bookings list }
 */
router.get("/my-bookings", protect, getMyBookings);

/**
 * @swagger
 * /api/booking/cancel/{id}:
 *   patch:
 *     tags: [Bookings]
 *     summary: Cancel a booking (User)
 *     description: Cancels the user's own booking. Frees up seats if booking was accepted.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Booking cancelled }
 *       400: { description: Cannot cancel completed/cancelled bookings }
 */
router.patch("/cancel/:id", protect, authorize("user"), cancelBooking);

/**
 * @swagger
 * /api/booking/payment-status:
 *   patch:
 *     tags: [Bookings]
 *     summary: Update payment status
 *     description: Updates payment status on a booking (sent/paid). Users mark "sent", drivers confirm "paid".
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id, payment_status]
 *             properties:
 *               booking_id: { type: string }
 *               payment_status: { type: string, enum: [sent, paid, refunded] }
 *     responses:
 *       200: { description: Payment status updated }
 */
router.patch("/payment-status", protect, updatePaymentStatus);

/**
 * @swagger
 * /api/booking/driver-bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: Get driver's bookings (Driver)
 *     description: Lists all bookings on rides assigned to the authenticated driver.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, accepted, in_progress, completed, cancelled, declined] }
 *     responses:
 *       200: { description: Driver's bookings list }
 */
router.get("/driver-bookings", protect, authorize("driver"), getDriverBookings);

/**
 * @swagger
 * /api/booking/driver-earnings:
 *   get:
 *     tags: [Bookings]
 *     summary: Get driver earnings summary (Driver)
 *     description: Returns earnings totals (today/week/month/all-time) and per-ride breakdown.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Earnings data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_earnings: { type: number }
 *                     today_earnings: { type: number }
 *                     week_earnings: { type: number }
 *                     month_earnings: { type: number }
 *                     total_rides: { type: integer }
 *                     total_passengers: { type: integer }
 *                     rides: { type: array, items: { type: object } }
 */
router.get("/driver-earnings", protect, authorize("driver"), getDriverEarnings);

/**
 * @swagger
 * /api/booking/accept/{id}:
 *   post:
 *     tags: [Bookings]
 *     summary: Accept a booking (Driver/Admin)
 *     description: Approves a pending booking and increments booked_seats on the ride.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_note: { type: string }
 *     responses:
 *       200: { description: Booking accepted }
 */
router.post(
  "/accept/:id",
  protect,
  authorize("admin", "super_admin", "driver"),
  acceptBooking,
);

/**
 * @swagger
 * /api/booking/decline/{id}:
 *   post:
 *     tags: [Bookings]
 *     summary: Decline a booking (Driver/Admin)
 *     description: Declines a pending booking.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_note: { type: string }
 *     responses:
 *       200: { description: Booking declined }
 */
router.post(
  "/decline/:id",
  protect,
  authorize("admin", "super_admin", "driver"),
  declineBooking,
);

/**
 * @swagger
 * /api/booking/all:
 *   get:
 *     tags: [Bookings]
 *     summary: Get all bookings (Admin)
 *     description: Admin-only paginated list of all bookings with optional filters.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: ride_id
 *         schema: { type: string }
 *       - in: query
 *         name: user_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated bookings list }
 */
router.get("/all", protect, authorize("admin", "super_admin"), getAllBookings);

module.exports = router;
