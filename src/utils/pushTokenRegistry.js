const NotificationSettings = require("../models/NotificationSettings");
const { Expo } = require("expo-server-sdk");

const MAX_PUSH_TOKENS_PER_USER = 10;

async function getOrCreateNotificationSettings(userId) {
  let settings = await NotificationSettings.findOne({ user_id: userId });
  if (!settings) {
    settings = await NotificationSettings.create({ user_id: userId });
  }
  return settings;
}

async function attachPushTokenToSettings(
  settings,
  userId,
  pushToken,
  deviceId,
  platform = "android",
) {
  await NotificationSettings.updateMany(
    {
      user_id: { $ne: userId },
      "expo_push_tokens.token": pushToken,
    },
    { $pull: { expo_push_tokens: { token: pushToken } } },
  );

  const normalizedPlatform = platform || "android";
  const now = new Date();
  const freshSettings =
    settings?._id && String(settings.user_id) === String(userId)
      ? await NotificationSettings.findById(settings._id)
      : await NotificationSettings.findOne({ user_id: userId });
  const currentTokens = Array.isArray(freshSettings?.expo_push_tokens)
    ? freshSettings.expo_push_tokens
    : [];

  const nextTokens = currentTokens.filter((entry) => {
    if (!entry?.token) return false;
    if (entry.token === pushToken) return false;
    if (deviceId && entry.device_id === deviceId) return false;
    return true;
  });

  nextTokens.push({
    token: pushToken,
    device_id: deviceId || null,
    platform: normalizedPlatform,
    added_at: now,
    last_synced_at: now,
  });

  const trimmedTokens = nextTokens
    .sort((a, b) => {
      const aTime = new Date(a?.last_synced_at || a?.added_at || 0).getTime();
      const bTime = new Date(b?.last_synced_at || b?.added_at || 0).getTime();
      return aTime - bTime;
    })
    .slice(-MAX_PUSH_TOKENS_PER_USER);

  await NotificationSettings.updateOne(
    { user_id: userId },
    { $set: { expo_push_tokens: trimmedTokens } },
  );

  return NotificationSettings.findOne({ user_id: userId });
}

async function syncDevicePushTokenForUser(
  userId,
  pushToken,
  deviceId,
  platform = "android",
) {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) return false;

  const settings = await getOrCreateNotificationSettings(userId);
  await attachPushTokenToSettings(
    settings,
    userId,
    pushToken,
    deviceId,
    platform,
  );
  console.log(
    `[Push] Token saved for user ${userId} device ${deviceId || "unknown"} platform ${platform || "android"}`,
  );
  return true;
}

async function removePushTokenForUser(userId, pushToken, deviceId) {
  if (pushToken) {
    await NotificationSettings.updateOne(
      { user_id: userId },
      { $pull: { expo_push_tokens: { token: pushToken } } },
    );
    return;
  }

  if (deviceId) {
    await NotificationSettings.updateOne(
      { user_id: userId },
      { $pull: { expo_push_tokens: { device_id: deviceId } } },
    );
  }
}

module.exports = {
  MAX_PUSH_TOKENS_PER_USER,
  getOrCreateNotificationSettings,
  attachPushTokenToSettings,
  syncDevicePushTokenForUser,
  removePushTokenForUser,
};
