const { Expo } = require("expo-server-sdk");
const NotificationSettings = require("../models/NotificationSettings");
const {
  deriveNotificationPresentation,
  enrichNotificationMetadata,
} = require("./notificationPresentation");

// Create Expo SDK client.
// EXPO_ACCESS_TOKEN is optional but recommended for production — it raises
// rate limits and enables push receipt checking.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true, // use FCM v1 for Android (legacy key support dropped by Google)
});

async function resolvePushTokensForUser(user_id, targetPushTokens = []) {
  const settings = await NotificationSettings.findOne({ user_id });
  if (!settings) {
    return {
      settings: null,
      tokens: [],
      error: "No notification settings found",
    };
  }

  if (!settings.push_notifications_enabled) {
    return {
      settings,
      tokens: [],
      error: "Push notifications disabled",
    };
  }

  const requestedTokens = Array.isArray(targetPushTokens)
    ? targetPushTokens.filter(Boolean)
    : [];

  const tokens = settings.expo_push_tokens
    .filter((t) => t.token && Expo.isExpoPushToken(t.token))
    .map((t) => t.token)
    .filter((token) =>
      requestedTokens.length > 0 ? requestedTokens.includes(token) : true,
    );

  return {
    settings,
    tokens,
    error: tokens.length === 0 ? "No valid Expo push tokens" : null,
  };
}

/**
 * Send push notification to a single user via Expo Push
 */
const sendPushNotification = async ({
  user_id,
  title,
  message,
  data = {},
  notificationType = "general",
  targetPushTokens = [],
}) => {
  try {
    const normalizedData = enrichNotificationMetadata(notificationType, data);
    const derived = deriveNotificationPresentation(
      notificationType,
      normalizedData,
    );
    const { settings, tokens, error } = await resolvePushTokensForUser(
      user_id,
      targetPushTokens,
    );

    if (!settings) return { success: false, error };
    if (error && error !== "No valid Expo push tokens") {
      return { success: false, error };
    }

    // Check specific notification preference
    if (
      derived.preferenceKey &&
      settings.notification_preferences[derived.preferenceKey] !== undefined &&
      !settings.notification_preferences[derived.preferenceKey]
    ) {
      return {
        success: false,
        error: `${derived.preferenceKey} notifications disabled`,
      };
    }

    if (tokens.length === 0) {
      return { success: false, error: "No valid Expo push tokens" };
    }

    // Build messages
    const messages = tokens.map((pushToken) => ({
      to: pushToken,
      sound: "default",
      title,
      body: message,
      subtitle:
        derived.category === "broadcast"
          ? "Campus announcement"
          : derived.category === "ride"
            ? "Ride update"
            : derived.category === "booking"
              ? "Booking update"
              : "UniRide update",
      priority: "high", // ensure delivery on both iOS and Android
      badge: 1, // iOS badge count
      channelId:
        derived.category === "broadcast"
          ? "announcements"
          : derived.category === "ride"
            ? "rides"
            : derived.category === "booking"
              ? "bookings"
              : "default",
      categoryId:
        derived.category === "broadcast"
          ? "announcements"
          : derived.category === "ride"
            ? "rides"
            : derived.category === "booking"
              ? "bookings"
              : "general",
      data: {
        type: notificationType,
        category: derived.category,
        preference_key: derived.preferenceKey,
        timestamp: new Date().toISOString(),
        ...normalizedData,
      },
    }));

    // Send in chunks (Expo recommends batching)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (err) {
        console.error("Error sending push notification chunk:", err.message);
      }
    }

    // Process tickets — remove invalid tokens and log errors
    const invalidTokens = [];
    let hasCredentialIssue = false;
    tickets.forEach((ticket, i) => {
      if (ticket.status === "error") {
        console.error(
          `[Push] Ticket error for token ${tokens[i]}: ${ticket.message}`,
          ticket.details,
        );
        if (ticket.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(tokens[i]);
        }

        if (ticket.details?.error === "InvalidCredentials") {
          hasCredentialIssue = true;
        }
      }
    });

    if (hasCredentialIssue) {
      console.error(
        "[Push] Expo reported InvalidCredentials. Verify EAS/Expo FCM credentials for Android production builds.",
      );
    }

    if (invalidTokens.length > 0) {
      await NotificationSettings.updateOne(
        { user_id },
        { $pull: { expo_push_tokens: { token: { $in: invalidTokens } } } },
      );
      console.log(`Removed ${invalidTokens.length} invalid Expo push tokens`);
    }

    const successCount = tickets.filter((t) => t.status === "ok").length;

    return {
      success: successCount > 0,
      sent_count: successCount,
      failed_count: tickets.length - successCount,
      total_tokens: tokens.length,
    };
  } catch (error) {
    console.error("Error sending push notification:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple users
 */
const sendBulkPushNotification = async ({
  user_ids,
  title,
  message,
  data = {},
  notificationType = "general",
}) => {
  try {
    const results = await Promise.allSettled(
      user_ids.map((user_id) =>
        sendPushNotification({
          user_id,
          title,
          message,
          data,
          notificationType,
        }),
      ),
    );

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        successCount++;
      } else if (
        r.status === "fulfilled" &&
        (r.value.error === "No valid Expo push tokens" ||
          r.value.error === "No notification settings found" ||
          r.value.error === "Push notifications disabled" ||
          (r.value.error && r.value.error.includes("notifications disabled")))
      ) {
        skippedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: true,
      total: user_ids.length,
      successful: successCount,
      skipped: skippedCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error("Error sending bulk push notifications:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to all users of a specific role
 */
const sendNotificationToRole = async ({
  role,
  title,
  message,
  data = {},
  notificationType = "general",
}) => {
  try {
    const User = require("../models/User");

    let roleFilter;
    if (role === "all") {
      roleFilter = {
        role: { $in: ["user", "driver", "admin", "super_admin"] },
      };
    } else if (role === "users") {
      roleFilter = { role: "user" };
    } else if (role === "drivers") {
      roleFilter = { role: "driver" };
    } else if (role === "admins") {
      roleFilter = { role: { $in: ["admin", "super_admin"] } };
    } else {
      roleFilter = { role };
    }

    const users = await User.find(roleFilter).select("_id");
    const user_ids = users.map((u) => u._id);

    if (user_ids.length === 0) {
      return {
        success: false,
        error: "No users found for the specified role",
      };
    }

    return await sendBulkPushNotification({
      user_ids,
      title,
      message,
      data,
      notificationType,
    });
  } catch (error) {
    console.error("Error sending notification to role:", error.message);
    return { success: false, error: error.message };
  }
};

const sendPushToSpecificToken = async ({
  user_id,
  push_token,
  title,
  message,
  data = {},
  notificationType = "general",
}) => {
  return sendPushNotification({
    user_id,
    title,
    message,
    data,
    notificationType,
    targetPushTokens: push_token ? [push_token] : [],
  });
};

module.exports = {
  expo,
  sendPushNotification,
  sendBulkPushNotification,
  sendNotificationToRole,
  sendPushToSpecificToken,
};
