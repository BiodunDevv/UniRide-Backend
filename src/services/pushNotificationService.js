const { Expo } = require("expo-server-sdk");
const NotificationSettings = require("../models/NotificationSettings");

// Create Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a single user via Expo Push
 */
const sendPushNotification = async ({
  user_id,
  title,
  message,
  data = {},
  notificationType = "general",
}) => {
  try {
    const settings = await NotificationSettings.findOne({ user_id });

    if (!settings) {
      return { success: false, error: "No notification settings found" };
    }

    if (!settings.push_notifications_enabled) {
      return { success: false, error: "Push notifications disabled" };
    }

    // Check specific notification preference
    if (
      settings.notification_preferences[notificationType] !== undefined &&
      !settings.notification_preferences[notificationType]
    ) {
      return {
        success: false,
        error: `${notificationType} notifications disabled`,
      };
    }

    // Get valid Expo push tokens
    const tokens = settings.expo_push_tokens
      .filter((t) => t.token && Expo.isExpoPushToken(t.token))
      .map((t) => t.token);

    if (tokens.length === 0) {
      return { success: false, error: "No valid Expo push tokens" };
    }

    // Build messages
    const messages = tokens.map((pushToken) => ({
      to: pushToken,
      sound: "default",
      title,
      body: message,
      data: {
        type: notificationType,
        timestamp: new Date().toISOString(),
        ...data,
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

    // Process tickets — remove invalid tokens
    const invalidTokens = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === "error") {
        if (
          ticket.details?.error === "DeviceNotRegistered" ||
          ticket.details?.error === "InvalidCredentials"
        ) {
          invalidTokens.push(tokens[i]);
        }
      }
    });

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

module.exports = {
  expo,
  sendPushNotification,
  sendBulkPushNotification,
  sendNotificationToRole,
};
