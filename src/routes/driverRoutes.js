const express = require("express");
const router = express.Router();
const {
  applyAsDriver,
  getApplicationStatus,
  getDriverProfile,
  updateDriverProfile,
  toggleDriverStatus,
} = require("../controllers/driverController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Driver management endpoints
 */

// Public route - no authentication required
router.post("/apply", apiLimiter, applyAsDriver);

// Protected routes - authentication required
router.get("/status", protect, getApplicationStatus);
router.get("/profile", protect, authorize("driver"), getDriverProfile);
router.patch("/profile", protect, authorize("driver"), updateDriverProfile);
router.patch(
  "/toggle-status",
  protect,
  authorize("driver"),
  toggleDriverStatus
);

module.exports = router;
