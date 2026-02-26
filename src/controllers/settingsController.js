const NotificationSettings = require("../models/NotificationSettings");
const User = require("../models/User");
const { Expo } = require("expo-server-sdk");

/**
 * @swagger
 * /api/settings/notifications:
 *   get:
 *     summary: Get notification settings for current user
 *     tags: [Settings - Notifications]
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
 *     tags: [Settings - Notifications]
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

    if (push_notifications_enabled !== undefined) {
      settings.push_notifications_enabled = push_notifications_enabled;
    }

    if (email_notifications_enabled !== undefined) {
      settings.email_notifications_enabled = email_notifications_enabled;
    }

    if (notification_preferences) {
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
 * /api/settings/push-token:
 *   post:
 *     summary: Register Expo push token for push notifications
 *     tags: [Settings - Push Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - push_token
 *             properties:
 *               push_token:
 *                 type: string
 *                 description: Expo push token (ExponentPushToken[...])
 *               device_id:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *     responses:
 *       200:
 *         description: Push token registered successfully
 */
const registerPushToken = async (req, res, next) => {
  try {
    const { push_token, device_id, platform } = req.body;

    if (!push_token) {
      return res.status(400).json({
        success: false,
        message: "push_token is required",
      });
    }

    if (!Expo.isExpoPushToken(push_token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Expo push token format",
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
    const existingToken = settings.expo_push_tokens.find(
      (t) => t.token === push_token,
    );

    if (!existingToken) {
      settings.expo_push_tokens.push({
        token: push_token,
        device_id: device_id || null,
        platform: platform || "android",
      });
      await settings.save();
    }

    res.status(200).json({
      success: true,
      message: "Push token registered successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/settings/push-token:
 *   delete:
 *     summary: Remove Expo push token
 *     tags: [Settings - Push Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - push_token
 *             properties:
 *               push_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Push token removed successfully
 */
const removePushToken = async (req, res, next) => {
  try {
    const { push_token } = req.body;

    if (!push_token) {
      return res.status(400).json({
        success: false,
        message: "push_token is required",
      });
    }

    await NotificationSettings.updateOne(
      { user_id: req.user._id },
      { $pull: { expo_push_tokens: { token: push_token } } },
    );

    res.status(200).json({
      success: true,
      message: "Push token removed successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  registerPushToken,
  removePushToken,
};
