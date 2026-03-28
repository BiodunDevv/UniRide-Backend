const express = require("express");
const router = express.Router();
const {
  getNotificationSettings,
  updateNotificationSettings,
  registerPushToken,
  removePushToken,
  getPushHealth,
  syncPushToken,
} = require("../controllers/settingsController");
const { protect } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Settings - Notifications
 *     description: User notification preference management
 *   - name: Settings - Push Tokens
 *     description: Expo push token registration
 */

// Notification settings routes
router.get("/notifications", protect, getNotificationSettings);
router.patch("/notifications", protect, updateNotificationSettings);
router.get("/push-health", protect, getPushHealth);
router.post("/push-sync", protect, syncPushToken);

// Expo push token management
router.post("/push-token", protect, registerPushToken);
router.delete("/push-token", protect, removePushToken);

module.exports = router;
