const admin = require("firebase-admin");
const NotificationSettings = require("../models/NotificationSettings");

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return;

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (!serviceAccount) {
      console.warn(
        "⚠️  Firebase service account not configured. Push notifications will be disabled."
      );
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log("✅ Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin SDK:", error.message);
  }
};

// Initialize Firebase on module load
initializeFirebase();

/**
 * Send push notification to a single user
 */
const sendPushNotification = async ({
  user_id,
  title,
  message,
  data = {},
  notificationType = "general",
}) => {
  try {
    if (!firebaseInitialized) {
      console.warn("Firebase not initialized. Skipping push notification.");
      return { success: false, error: "Firebase not initialized" };
    }

    // Get user's notification settings
    const settings = await NotificationSettings.findOne({ user_id });

    if (!settings) {
      console.warn(`No notification settings found for user ${user_id}`);
      return { success: false, error: "No notification settings found" };
    }

    // Check if push notifications are enabled
    if (!settings.push_notifications_enabled) {
      console.log(`Push notifications disabled for user ${user_id}`);
      return { success: false, error: "Push notifications disabled" };
    }

    // Check specific notification preference
    const preferenceKey = notificationType;
    if (
      settings.notification_preferences[preferenceKey] !== undefined &&
      !settings.notification_preferences[preferenceKey]
    ) {
      console.log(
        `User ${user_id} has disabled ${notificationType} notifications`
      );
      return {
        success: false,
        error: `${notificationType} notifications disabled`,
      };
    }

    // Get FCM tokens
    const tokens = settings.fcm_tokens
      .filter((t) => t.token)
      .map((t) => t.token);

    if (tokens.length === 0) {
      console.warn(`No FCM tokens found for user ${user_id}`);
      return { success: false, error: "No FCM tokens" };
    }

    // Prepare notification payload
    const payload = {
      notification: {
        title,
        body: message,
      },
      data: {
        type: notificationType,
        timestamp: new Date().toISOString(),
        ...data,
      },
    };

    // Send to all tokens
    const results = await Promise.allSettled(
      tokens.map((token) =>
        admin.messaging().send({
          token,
          ...payload,
        })
      )
    );

    // Filter out invalid tokens
    const invalidTokens = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        if (
          result.reason?.code === "messaging/invalid-registration-token" ||
          result.reason?.code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[index]);
        }
      }
    });

    // Remove invalid tokens
    if (invalidTokens.length > 0) {
      await NotificationSettings.updateOne(
        { user_id },
        {
          $pull: {
            fcm_tokens: { token: { $in: invalidTokens } },
          },
        }
      );
      console.log(`Removed ${invalidTokens.length} invalid FCM tokens`);
    }

    const successCount = results.filter((r) => r.status === "fulfilled").length;

    return {
      success: successCount > 0,
      sent_count: successCount,
      failed_count: results.length - successCount,
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
    if (!firebaseInitialized) {
      console.warn("Firebase not initialized. Skipping bulk notifications.");
      return {
        success: false,
        error: "Firebase not initialized",
        results: [],
      };
    }

    const results = await Promise.allSettled(
      user_ids.map((user_id) =>
        sendPushNotification({
          user_id,
          title,
          message,
          data,
          notificationType,
        })
      )
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    return {
      success: successCount > 0,
      total: user_ids.length,
      successful: successCount,
      failed: user_ids.length - successCount,
      results,
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

    // Determine role filter
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

    // Get all users with the role
    const users = await User.find(roleFilter).select("_id");
    const user_ids = users.map((u) => u._id);

    if (user_ids.length === 0) {
      return {
        success: false,
        error: "No users found for the specified role",
      };
    }

    // Send bulk notifications
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
  initializeFirebase,
  sendPushNotification,
  sendBulkPushNotification,
  sendNotificationToRole,
};
