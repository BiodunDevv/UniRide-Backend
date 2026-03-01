const express = require("express");
const router = express.Router();
const {
  createRide,
  getActiveRides,
  getRideDetails,
  getAllRides,
  updateRide,
  cancelRide,
  updateDriverLocation,
  endRide,
  getMyRides,
  acceptRide,
  getAvailableRequests,
} = require("../controllers/rideController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

// Any authenticated user can create a ride (users create requests, drivers/admins schedule)
router.post("/", protect, apiLimiter, createRide);

// Admin: manage rides
router.get("/all", protect, authorize("admin", "super_admin"), getAllRides);
router.patch("/:id", protect, authorize("admin", "super_admin"), updateRide);
router.post(
  "/:id/cancel",
  protect,
  authorize("admin", "super_admin"),
  cancelRide,
);

// Public / user: browse + view rides
router.get("/active", protect, getActiveRides);
router.get("/my-rides", protect, authorize("driver"), getMyRides);
router.get(
  "/available-requests",
  protect,
  authorize("driver"),
  getAvailableRequests,
);
router.get("/:id", protect, getRideDetails);

// Driver: accept ride, location + end ride
router.post("/:id/accept", protect, authorize("driver"), acceptRide);
router.post(
  "/:id/location",
  protect,
  authorize("driver"),
  updateDriverLocation,
);
router.post("/:id/end", protect, authorize("driver"), endRide);

module.exports = router;
