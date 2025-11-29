const NotificationSettings = require("../models/NotificationSettings");
const User = require("../models/User");

/**
 * @swagger
 * /api/settings/notifications:
 *   get:
 *     summary: Get notification settings for current user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification settings retrieved
 */
const getNotificationSettings = async (req, res, next) => {
  try {
    let settings = await NotificationSettings.findOne({
      user_id: req.user._id,
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await NotificationSettings.create({
        user_id: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/settings/notifications:
 *   patch:
 *     summary: Update notification settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               push_notifications_enabled:
 *                 type: boolean
 *               email_notifications_enabled:
 *                 type: boolean
 *               notification_preferences:
 *                 type: object
 *     responses:
 *       200:
 *         description: Settings updated successfully
 */
const updateNotificationSettings = async (req, res, next) => {
  try {
    const {
      push_notifications_enabled,
      email_notifications_enabled,
      notification_preferences,
    } = req.body;

    let settings = await NotificationSettings.findOne({
      user_id: req.user._id,
    });

    if (!settings) {
      settings = await NotificationSettings.create({
        user_id: req.user._id,
      });
    }

    // Update settings
    if (push_notifications_enabled !== undefined) {
      settings.push_notifications_enabled = push_notifications_enabled;
    }

    if (email_notifications_enabled !== undefined) {
      settings.email_notifications_enabled = email_notifications_enabled;
    }

    if (notification_preferences) {
      // Merge preferences
      settings.notification_preferences = {
        ...settings.notification_preferences.toObject(),
        ...notification_preferences,
      };
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Notification settings updated successfully",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/settings/fcm-token:
 *   post:
 *     summary: Register FCM token for push notifications
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcm_token
 *             properties:
 *               fcm_token:
 *                 type: string
 *               device_id:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *     responses:
 *       200:
 *         description: FCM token registered successfully
 */
const registerFCMToken = async (req, res, next) => {
  try {
    const { fcm_token, device_id, platform } = req.body;

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    let settings = await NotificationSettings.findOne({
      user_id: req.user._id,
    });

    if (!settings) {
      settings = await NotificationSettings.create({
        user_id: req.user._id,
      });
    }

    // Check if token already exists
    const existingToken = settings.fcm_tokens.find(
      (t) => t.token === fcm_token
    );

    if (!existingToken) {
      // Add new token
      settings.fcm_tokens.push({
        token: fcm_token,
        device_id: device_id || null,
        platform: platform || "android",
      });
      await settings.save();
    }

    res.status(200).json({
      success: true,
      message: "FCM token registered successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/settings/fcm-token:
 *   delete:
 *     summary: Remove FCM token
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcm_token
 *             properties:
 *               fcm_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: FCM token removed successfully
 */
const removeFCMToken = async (req, res, next) => {
  try {
    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    await NotificationSettings.updateOne(
      { user_id: req.user._id },
      {
        $pull: {
          fcm_tokens: { token: fcm_token },
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  registerFCMToken,
  removeFCMToken,
};
