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
} = require("../controllers/bookingController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

// User
router.post("/request", protect, authorize("user"), apiLimiter, requestRide);
router.post("/checkin", protect, authorize("user"), checkInRide);
router.post("/rate", protect, authorize("user"), rateDriver);
router.get("/my-bookings", protect, getMyBookings);
router.patch("/cancel/:id", protect, authorize("user"), cancelBooking);
router.patch("/payment-status", protect, updatePaymentStatus);

// Driver: view & manage bookings on their rides
router.get("/driver-bookings", protect, authorize("driver"), getDriverBookings);
router.post(
  "/accept/:id",
  protect,
  authorize("admin", "super_admin", "driver"),
  acceptBooking,
);
router.post(
  "/decline/:id",
  protect,
  authorize("admin", "super_admin", "driver"),
  declineBooking,
);

// Admin: list all
router.get("/all", protect, authorize("admin", "super_admin"), getAllBookings);

module.exports = router;
