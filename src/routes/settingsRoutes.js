const express = require("express");
const router = express.Router();
const {
  getNotificationSettings,
  updateNotificationSettings,
  registerFCMToken,
  removeFCMToken,
} = require("../controllers/settingsController");
const { protect } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: User settings management (notification preferences, FCM tokens)
 */

// Notification settings routes
router.get("/notifications", protect, getNotificationSettings);
router.patch("/notifications", protect, updateNotificationSettings);

// FCM token management
router.post("/fcm-token", protect, registerFCMToken);
router.delete("/fcm-token", protect, removeFCMToken);

module.exports = router;
