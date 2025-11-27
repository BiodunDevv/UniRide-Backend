const express = require("express");
const router = express.Router();
const {
  requestRide,
  confirmBooking,
  checkInRide,
  updatePaymentStatus,
  rateDriver,
  getMyBookings,
  cancelBooking,
} = require("../controllers/bookingController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   name: Booking
 *   description: Booking management endpoints
 */

router.post("/request", protect, authorize("user"), apiLimiter, requestRide);
router.post("/confirm/:id", protect, authorize("driver"), confirmBooking);
router.post("/checkin", protect, authorize("user"), checkInRide);
router.patch("/payment-status", protect, updatePaymentStatus);
router.post("/rate", protect, authorize("user"), rateDriver);
router.get("/my-bookings", protect, getMyBookings);
router.patch("/cancel/:id", protect, authorize("user"), cancelBooking);

module.exports = router;
