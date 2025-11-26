const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const {
  validateCreateBooking,
  validateCheckIn,
  validateUpdatePayment,
  validateAddRating,
} = require('../middlewares/validateMiddleware');

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Create a new booking (student only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ride_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 */
router.post('/', protect, authorize('student'), validateCreateBooking, bookingController.createBooking);

/**
 * @swagger
 * /api/bookings/my:
 *   get:
 *     summary: Get my bookings (student only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 */
router.get('/my', protect, authorize('student'), bookingController.getMyBookings);

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Get booking details by ID
 *     tags: [Bookings]
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
 *         description: Booking details retrieved
 */
router.get('/:id', protect, bookingController.getBookingById);

/**
 * @swagger
 * /api/bookings/{id}/confirm:
 *   post:
 *     summary: Confirm booking (driver only)
 *     tags: [Bookings]
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
 *         description: Booking confirmed, bank details exposed
 */
router.post('/:id/confirm', protect, authorize('driver'), bookingController.confirmBooking);

/**
 * @swagger
 * /api/bookings/{id}/check-in:
 *   post:
 *     summary: Check-in with 4-digit code (student only)
 *     tags: [Bookings]
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
 *             properties:
 *               check_in_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Checked in successfully
 */
router.post('/:id/check-in', protect, authorize('student'), validateCheckIn, bookingController.checkIn);

/**
 * @swagger
 * /api/bookings/{id}/payment:
 *   put:
 *     summary: Update payment status (student only)
 *     tags: [Bookings]
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
 *             properties:
 *               payment_method:
 *                 type: string
 *                 enum: [cash, transfer]
 *     responses:
 *       200:
 *         description: Payment status updated
 */
router.put('/:id/payment', protect, authorize('student'), validateUpdatePayment, bookingController.updatePaymentStatus);

/**
 * @swagger
 * /api/bookings/{id}/rating:
 *   post:
 *     summary: Add rating and review (student only)
 *     tags: [Bookings]
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
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               review:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rating submitted successfully
 */
router.post('/:id/rating', protect, authorize('student'), validateAddRating, bookingController.addRating);

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   post:
 *     summary: Cancel booking (student only)
 *     tags: [Bookings]
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
 *         description: Booking cancelled successfully
 */
router.post('/:id/cancel', protect, authorize('student'), bookingController.cancelBooking);

module.exports = router;
