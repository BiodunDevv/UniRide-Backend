const express = require("express");
const router = express.Router();
const {
  createRide,
  getActiveRides,
  getRideDetails,
  updateDriverLocation,
  endRide,
  getMyRides,
} = require("../controllers/rideController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   name: Rides
 *   description: Ride management endpoints
 */

router.post("/", protect, authorize("driver"), apiLimiter, createRide);
router.get("/active", protect, getActiveRides);
router.get("/my-rides", protect, authorize("driver"), getMyRides);
router.get("/:id", protect, getRideDetails);
router.post(
  "/:id/location",
  protect,
  authorize("driver"),
  updateDriverLocation
);
router.post("/:id/end", protect, authorize("driver"), endRide);

module.exports = router;
