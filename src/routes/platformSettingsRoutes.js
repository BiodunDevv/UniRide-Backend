const express = require("express");
const router = express.Router();
const {
  getPlatformSettings,
  getFullPlatformSettings,
  updatePlatformSettings,
} = require("../controllers/platformSettingsController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");

// Public — mobile apps fetch this on startup
router.get("/", getPlatformSettings);

// Admin only — full settings with metadata
router.get(
  "/admin",
  protect,
  authorize("admin", "super_admin"),
  getFullPlatformSettings,
);

// Admin only — update settings
router.patch(
  "/",
  protect,
  authorize("admin", "super_admin"),
  updatePlatformSettings,
);

module.exports = router;
