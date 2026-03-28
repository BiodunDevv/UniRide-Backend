const express = require("express");
const router = express.Router();
const {
  applyAsDriver,
  checkApplicationByEmail,
  getApplicationStatus,
  getDriverProfile,
  getPublicDriverProfile,
  updateDriverProfile,
  toggleDriverStatus,
  updateDriverLicense,
  updateVehicleImage,
  verifyBankAccount,
  getBankList,
  goOnline,
  goOffline,
  updateDriverLiveLocation,
  getOnlineDrivers,
  getDriverLocations,
  getActiveRiderLocations,
  updateUserLocation,
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
router.post("/check-status", apiLimiter, checkApplicationByEmail);
router.get("/banks", getBankList);

// Protected routes - authentication required
router.get("/status", protect, getApplicationStatus);
router.get("/public/:id", protect, getPublicDriverProfile);
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

// ── Location & Online Status ────────────────────────────────────────────────
router.patch("/go-online", protect, authorize("driver"), goOnline);
router.patch("/go-offline", protect, authorize("driver"), goOffline);
router.post(
  "/location",
  protect,
  authorize("driver"),
  updateDriverLiveLocation,
);
router.get("/online", protect, getOnlineDrivers);
router.get(
  "/locations",
  protect,
  authorize("admin", "super_admin"),
  getDriverLocations,
);
router.get(
  "/active-riders",
  protect,
  authorize("admin", "super_admin"),
  getActiveRiderLocations,
);

// ── User Location ───────────────────────────────────────────────────────────
router.post("/user-location", protect, updateUserLocation);

module.exports = router;
