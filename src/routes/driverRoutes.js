const express = require("express");
const router = express.Router();
const {
  applyAsDriver,
  getApplicationStatus,
  getDriverProfile,
  updateDriverProfile,
  toggleDriverStatus,
  updateDriverLicense,
  updateVehicleImage,
  verifyBankAccount,
  getBankList,
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

// Public routes
router.post("/apply", apiLimiter, applyAsDriver);
router.get("/banks", getBankList);

// Protected routes - authentication required
router.get("/status", protect, getApplicationStatus);
router.get("/profile", protect, authorize("driver"), getDriverProfile);
router.patch("/profile", protect, authorize("driver"), updateDriverProfile);
router.patch("/license", protect, authorize("driver"), updateDriverLicense);
router.patch(
  "/vehicle-image",
  protect,
  authorize("driver"),
  updateVehicleImage,
);
router.post("/verify-bank", protect, authorize("driver"), verifyBankAccount);
router.patch(
  "/toggle-status",
  protect,
  authorize("driver"),
  toggleDriverStatus,
);

module.exports = router;
