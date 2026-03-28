const NotificationSettings = require("../models/NotificationSettings");
const { Expo } = require("expo-server-sdk");
const {
  sendPushToSpecificToken,
} = require("../services/pushNotificationService");
const {
  getOrCreateNotificationSettings,
  attachPushTokenToSettings,
  removePushTokenForUser,
} = require("../utils/pushTokenRegistry");

const DEFAULT_NOTIFICATION_PREFERENCES = {
  ride_requests: true,
  ride_accepted: true,
  ride_started: true,
  ride_completed: true,
  ride_cancelled: true,
  driver_arriving: true,
  payment_updates: true,
  new_ride_requests: true,
  booking_confirmations: true,
  rider_messages: true,
  earnings_updates: true,
  application_updates: true,
  new_driver_applications: true,
  support_tickets: true,
  system_alerts: true,
  user_reports: true,
  promotional_messages: true,
  broadcast_messages: true,
};

function getPreferenceSource(settings) {
  if (!settings?.notification_preferences) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const raw =
    typeof settings.notification_preferences.toObject === "function"
      ? settings.notification_preferences.toObject()
      : settings.notification_preferences;

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(raw || {}),
  };
}

function serializeNotificationSettings(settings) {
  return {
    push_notifications_enabled: Boolean(settings.push_notifications_enabled),
    email_notifications_enabled: Boolean(settings.email_notifications_enabled),
    notification_preferences: getPreferenceSource(settings),
    updatedAt: settings.updatedAt,
    createdAt: settings.createdAt,
  };
}

async function trySendSpecificPush({
  user_id,
  push_token,
  title,
  message,
  notificationType,
  data,
}) {
  try {
    return await sendPushToSpecificToken({
      user_id,
      push_token,
      title,
      message,
      notificationType,
      data,
    });
  } catch (error) {
    console.error(
      `[Push] Failed targeted send for user ${user_id}:`,
      error?.message || error,
    );
    return {
      success: false,
      error: error?.message || "Failed to send push notification",
    };
  }
}

const getPushHealth = async (req, res, next) => {
  try {
    const { push_token, device_id } = req.query;

    const settings = await getOrCreateNotificationSettings(req.user._id);

    const preferences = getPreferenceSource(settings);
    const tokens = settings.expo_push_tokens || [];
    const matchedToken =
      (push_token && tokens.find((entry) => entry.token === push_token)) || null;
    const matchedDevice =
      (device_id &&
        tokens.find((entry) => entry.device_id && entry.device_id === device_id)) ||
      null;
    const currentPushTokenRegistered = push_token
      ? tokens.some((entry) => entry.token === push_token)
      : false;
    const currentDeviceRegistered = device_id
      ? tokens.some((entry) => entry.device_id === device_id)
      : false;

    const preferenceHealth = Object.entries(preferences).reduce(
      (acc, [key, value]) => {
        acc[key] = { enabled: Boolean(value) };
        return acc;
      },
      {},
    );

    res.status(200).json({
      success: true,
      data: {
        native_push_available: true,
        push_notifications_enabled: Boolean(settings.push_notifications_enabled),
        current_push_token_registered: currentPushTokenRegistered,
        current_device_registered: currentDeviceRegistered,
        registered_token_count: tokens.length,
        linked_device_count: tokens.length,
        last_registration_at:
          matchedToken?.last_synced_at ||
          matchedDevice?.last_synced_at ||
          matchedToken?.added_at ||
          matchedDevice?.added_at ||
          null,
        preference_health: preferenceHealth,
      },
    });
  } catch (error) {
    next(error);
  }
};

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
      data: serializeNotificationSettings(settings),
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

    if (typeof push_notifications_enabled === "boolean") {
      settings.push_notifications_enabled = push_notifications_enabled;
    }

    if (typeof email_notifications_enabled === "boolean") {
      settings.email_notifications_enabled = email_notifications_enabled;
    }

    if (
      notification_preferences &&
      typeof notification_preferences === "object" &&
      !Array.isArray(notification_preferences)
    ) {
      const currentPreferences = getPreferenceSource(settings);
      const sanitizedPreferences = Object.entries(notification_preferences)
        .filter(
          ([key, value]) =>
            Object.prototype.hasOwnProperty.call(
              DEFAULT_NOTIFICATION_PREFERENCES,
              key,
            ) && typeof value === "boolean",
        )
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});

      settings.notification_preferences = {
        ...currentPreferences,
        ...sanitizedPreferences,
      };
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Notification settings updated successfully",
      data: serializeNotificationSettings(settings),
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

    const settings = await getOrCreateNotificationSettings(req.user._id);
    await attachPushTokenToSettings(
      settings,
      req.user._id,
      push_token,
      device_id,
      platform,
    );

    console.log(
      `[Push] Token registered for user ${req.user._id} device ${device_id || "unknown"} platform ${platform || "android"}`,
    );

    res.status(200).json({
      success: true,
      message: "Push token registered successfully",
    });
  } catch (error) {
    next(error);
  }
};

const syncPushToken = async (req, res, next) => {
  try {
    const {
      push_token,
      device_id,
      platform,
      send_login_test = false,
      send_test_push = false,
    } = req.body;

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

    const settings = await getOrCreateNotificationSettings(req.user._id);
    await attachPushTokenToSettings(
      settings,
      req.user._id,
      push_token,
      device_id,
      platform,
    );

    let pushResult = null;
    if (send_login_test || send_test_push) {
      const title = send_login_test ? "Login Ready" : "Push Test";
      const message = send_login_test
        ? "UniRide is ready on this device. Push notifications are connected."
        : "This is a test push from your notification settings.";

      pushResult = await trySendSpecificPush({
        user_id: req.user._id,
        push_token,
        title,
        message,
        notificationType: "system",
        data: {
          action: send_login_test ? "login_push_ready" : "push_test",
          route: "notifications",
          device_id: device_id || null,
          push_token,
        },
      });
    }

    const refreshedSettings = await getOrCreateNotificationSettings(req.user._id);
    const preferences = getPreferenceSource(refreshedSettings);
    const tokens = refreshedSettings.expo_push_tokens || [];
    const matchedToken =
      tokens.find((entry) => entry.token === push_token) || null;

    console.log(
      `[Push] Sync complete for user ${req.user._id} device ${device_id || "unknown"} send_login_test=${Boolean(send_login_test)} send_test_push=${Boolean(send_test_push)} result=${pushResult?.success ? "sent" : pushResult?.error || "saved-only"}`,
    );

    return res.status(200).json({
      success: true,
      message: "Push token synced successfully",
      data: {
        native_push_available: true,
        push_notifications_enabled: Boolean(
          refreshedSettings.push_notifications_enabled,
        ),
        current_push_token_registered: true,
        current_device_registered: Boolean(
          device_id &&
            tokens.some(
              (entry) => entry.device_id && entry.device_id === device_id,
            ),
        ),
        registered_token_count: tokens.length,
        last_registration_at:
          matchedToken?.last_synced_at || matchedToken?.added_at || null,
        preference_health: Object.entries(preferences).reduce((acc, [key, value]) => {
          acc[key] = { enabled: Boolean(value) };
          return acc;
        }, {}),
        push_result: pushResult,
      },
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

    await removePushTokenForUser(req.user._id, push_token, null);

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
  getPushHealth,
  syncPushToken,
};
