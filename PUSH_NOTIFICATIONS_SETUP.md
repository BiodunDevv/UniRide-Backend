# Firebase Push Notification Setup Guide

This guide will help you set up Firebase Cloud Messaging (FCM) for the UniRide mobile app.

## 📱 Overview

UniRide uses Firebase Cloud Messaging to send push notifications to users and drivers on their mobile devices. The system includes:

- **Granular notification preferences** - Users can control what notifications they receive
- **Multi-device support** - Users can receive notifications on up to 3 devices
- **Role-based notifications** - Different notification types for users, drivers, and admins
- **Broadcast messaging** - Admins can send announcements to specific groups or all users

## 🔧 Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add Project** or select an existing project
3. Enter project name (e.g., "UniRide")
4. (Optional) Enable Google Analytics
5. Click **Create Project**

### Step 2: Enable Cloud Messaging

1. In your Firebase project, go to **Build** → **Cloud Messaging**
2. Cloud Messaging is enabled by default for new projects
3. Note: You'll need to configure your Android/iOS apps separately (see Mobile App Setup below)

### Step 3: Generate Service Account Key

1. Click the **gear icon** ⚙️ next to "Project Overview"
2. Select **Project Settings**
3. Go to the **Service Accounts** tab
4. Click **Generate New Private Key**
5. A JSON file will be downloaded - **keep this secure!**

### Step 4: Add to Backend Environment

1. Open the downloaded JSON file in a text editor
2. Copy the **entire JSON content**
3. Open your `.env` file in the backend project
4. Find the `FIREBASE_SERVICE_ACCOUNT_KEY` variable
5. Replace the placeholder with your JSON content **as a single-line string**:

```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

⚠️ **Important**: The entire JSON must be on one line, wrapped in single quotes.

### Step 5: Restart Backend Server

```bash
npm run dev
```

Check the console for: `✅ Firebase Admin initialized successfully`

If you see an error, verify your JSON is correctly formatted in the .env file.

## 📲 Mobile App Setup

### For Android (React Native / Flutter)

1. In Firebase Console, click **Add App** → Android
2. Enter your Android package name (e.g., `com.uniride.app`)
3. Download `google-services.json`
4. Place it in `android/app/` directory
5. Follow Firebase's setup instructions to add dependencies

### For iOS (React Native / Flutter)

1. In Firebase Console, click **Add App** → iOS
2. Enter your iOS bundle ID (e.g., `com.uniride.app`)
3. Download `GoogleService-Info.plist`
4. Add to your Xcode project
5. Follow Firebase's setup instructions

### Frontend Integration

Your mobile app needs to:

1. **Request notification permissions** from the user
2. **Get FCM token** when permission is granted
3. **Send token to backend** using the registration endpoint
4. **Handle token refresh** when it changes

#### Example (React Native with @react-native-firebase/messaging):

```javascript
import messaging from "@react-native-firebase/messaging";

// Request permission
async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log("Authorization status:", authStatus);
    return true;
  }
  return false;
}

// Get FCM token
async function getFCMToken(userId, deviceId) {
  const hasPermission = await requestUserPermission();
  if (!hasPermission) return;

  const token = await messaging().getToken();

  // Send to backend
  await fetch("https://your-backend.com/api/settings/fcm-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${yourAuthToken}`,
    },
    body: JSON.stringify({
      fcm_token: token,
      device_id: deviceId, // Same device_id used in login
      platform: Platform.OS, // 'ios' or 'android'
    }),
  });
}

// Listen for token refresh
messaging().onTokenRefresh(async (token) => {
  // Update token on backend
  await fetch("https://your-backend.com/api/settings/fcm-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${yourAuthToken}`,
    },
    body: JSON.stringify({
      fcm_token: token,
      device_id: deviceId,
      platform: Platform.OS,
    }),
  });
});

// Handle foreground notifications
messaging().onMessage(async (remoteMessage) => {
  console.log("Notification received!", remoteMessage);
  // Show local notification or update UI
});

// Handle background/quit state notifications
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Background notification:", remoteMessage);
});
```

## 🎯 API Endpoints

### Register FCM Token

```http
POST /api/settings/fcm-token
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "fcm_token": "fcm_token_from_firebase",
  "device_id": "unique_device_id",
  "platform": "ios" // or "android"
}
```

### Remove FCM Token

```http
DELETE /api/settings/fcm-token
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "fcm_token": "fcm_token_to_remove"
}
```

### Get Notification Settings

```http
GET /api/settings/notifications
Authorization: Bearer {jwt_token}
```

Response:

```json
{
  "success": true,
  "data": {
    "user_id": "user_id",
    "push_notifications_enabled": true,
    "email_notifications_enabled": true,
    "notification_preferences": {
      "ride_accepted": true,
      "ride_started": true,
      "ride_completed": true,
      "driver_nearby": true,
      "payment_received": true,
      "new_ride_requests": true,
      "booking_confirmed": true,
      "new_driver_applications": true,
      "user_flagged": true
    },
    "promotional_notifications": true,
    "broadcast_messages": true,
    "fcm_tokens": [
      {
        "token": "fcm_token_1",
        "device_id": "device_1",
        "platform": "ios",
        "added_at": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Update Notification Preferences

```http
PATCH /api/settings/notifications
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "push_notifications_enabled": false,
  "notification_preferences": {
    "ride_accepted": true,
    "promotional_notifications": false
  }
}
```

### Send Broadcast Message (Admin Only)

```http
POST /api/admin/broadcast
Authorization: Bearer {admin_jwt_token}
Content-Type: application/json

{
  "title": "System Maintenance",
  "message": "UniRide will undergo maintenance tonight from 2-4 AM",
  "target_audience": "all", // "all", "users", "drivers", or "admins"
  "channels": ["push", "email"] // Optional, defaults to ["push"]
}
```

### Get Broadcast History (Admin Only)

```http
GET /api/admin/broadcasts?page=1&limit=20
Authorization: Bearer {admin_jwt_token}
```

## 🔔 Notification Types

### For Users (`role: user`)

- `ride_accepted` - Driver accepted your ride request
- `ride_started` - Your ride has started
- `ride_completed` - Your ride is complete
- `driver_nearby` - Driver is approaching pickup location
- `payment_received` - Payment confirmation
- `promotional_notifications` - Promotional offers and updates
- `broadcast_messages` - Important announcements

### For Drivers (`role: driver`)

- `new_ride_requests` - New ride request in your area
- `booking_confirmed` - Passenger confirmed pickup
- `payment_received` - Payment received from passenger
- `promotional_notifications` - Driver promotions
- `broadcast_messages` - Important announcements

### For Admins (`role: admin` or `super_admin`)

- `new_driver_applications` - New driver application submitted
- `user_flagged` - User has been flagged
- `system_alerts` - System-level alerts
- `broadcast_messages` - Important announcements

## 🧪 Testing Notifications

### 1. Test Single User Notification

Use this in your backend code to test sending to a specific user:

```javascript
const { sendPushNotification } = require("./services/pushNotificationService");

await sendPushNotification(
  "user_id_here",
  "Test Notification",
  "This is a test message",
  { custom_data: "value" }, // Optional data payload
  "ride_accepted" // Notification type
);
```

### 2. Test Broadcast

Send via Postman/Thunder Client:

```http
POST http://localhost:5000/api/admin/broadcast
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "title": "Test Broadcast",
  "message": "Testing broadcast notifications",
  "target_audience": "users"
}
```

### 3. Test Device Registration

From mobile app after login:

```http
POST http://localhost:5000/api/settings/fcm-token
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "fcm_token": "test_fcm_token_from_device",
  "device_id": "test_device_123",
  "platform": "android"
}
```

## 🐛 Troubleshooting

### "Firebase Admin not initialized" Error

- Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is set in `.env`
- Check JSON format is valid (use online JSON validator)
- Ensure entire JSON is on one line wrapped in single quotes
- Restart backend server after updating `.env`

### Notifications Not Received

1. **Check user preferences**: Verify push notifications are enabled

   ```http
   GET /api/settings/notifications
   ```

2. **Check FCM token is registered**:

   - Response should include the device's FCM token in `fcm_tokens` array

3. **Check notification type is enabled**:

   - Ensure the specific notification type (e.g., `ride_accepted`) is `true` in preferences

4. **Check backend logs**:

   - Look for "Push notification sent successfully" or error messages

5. **Verify Firebase project setup**:
   - Ensure Cloud Messaging is enabled in Firebase Console
   - Check that mobile app is properly configured with `google-services.json` (Android) or `GoogleService-Info.plist` (iOS)

### Invalid Token Errors

- The system automatically removes invalid FCM tokens
- Users need to re-register their device token if reinstalling the app
- Token refresh should be handled automatically by Firebase SDK on the mobile app

## 📊 Best Practices

1. **Always request permission** before attempting to get FCM token
2. **Handle token refresh** - FCM tokens can change, update backend when they do
3. **Remove tokens on logout** - Clean up FCM tokens when user logs out
4. **Respect user preferences** - Always check notification settings before sending
5. **Use notification types** - Categorize notifications so users can control what they receive
6. **Test on real devices** - Push notifications don't work on iOS simulator
7. **Monitor delivery rates** - Check broadcast history for failed sends
8. **Keep service account secure** - Never commit service account JSON to version control

## 🔒 Security Notes

- Service account JSON grants admin access to Firebase - keep it secret
- Never expose `FIREBASE_SERVICE_ACCOUNT_KEY` in client-side code
- FCM tokens are sensitive - only store them server-side
- Validate user permissions before sending notifications
- Rate limit broadcast endpoints to prevent spam

## 📚 Additional Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [React Native Firebase](https://rnfirebase.io/)
- [Flutter Firebase Messaging](https://firebase.flutter.dev/docs/messaging/overview)
- [FCM HTTP v1 API](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)

## ✅ Verification Checklist

- [ ] Firebase project created
- [ ] Cloud Messaging enabled
- [ ] Service account key generated
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` added to `.env`
- [ ] Backend server restarted and initialized Firebase successfully
- [ ] Mobile app configured with `google-services.json` (Android) or `GoogleService-Info.plist` (iOS)
- [ ] FCM token registration implemented in mobile app
- [ ] Token refresh handler implemented
- [ ] Foreground notification handler implemented
- [ ] Background notification handler implemented
- [ ] Test notification sent successfully
- [ ] User preferences working correctly
- [ ] Broadcast messaging tested

---

**Need help?** Check the backend logs for detailed error messages when notifications fail to send.
