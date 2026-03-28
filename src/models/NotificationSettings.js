const mongoose = require("mongoose");

const notificationSettingsSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    expo_push_tokens: [
      {
        token: {
          type: String,
          required: true,
        },
        device_id: {
          type: String,
        },
        platform: {
          type: String,
          enum: ["android", "ios", "web"],
        },
        added_at: {
          type: Date,
          default: Date.now,
        },
        last_synced_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    push_notifications_enabled: {
      type: Boolean,
      default: true,
    },
    email_notifications_enabled: {
      type: Boolean,
      default: true,
    },
    notification_preferences: {
      // For Users
      ride_requests: {
        type: Boolean,
        default: true,
      },
      ride_accepted: {
        type: Boolean,
        default: true,
      },
      ride_started: {
        type: Boolean,
        default: true,
      },
      ride_completed: {
        type: Boolean,
        default: true,
      },
      ride_cancelled: {
        type: Boolean,
        default: true,
      },
      driver_arriving: {
        type: Boolean,
        default: true,
      },
      payment_updates: {
        type: Boolean,
        default: true,
      },

      // For Drivers
      new_ride_requests: {
        type: Boolean,
        default: true,
      },
      booking_confirmations: {
        type: Boolean,
        default: true,
      },
      rider_messages: {
        type: Boolean,
        default: true,
      },
      earnings_updates: {
        type: Boolean,
        default: true,
      },
      application_updates: {
        type: Boolean,
        default: true,
      },

      // For Admins
      new_driver_applications: {
        type: Boolean,
        default: true,
      },
      support_tickets: {
        type: Boolean,
        default: true,
      },
      system_alerts: {
        type: Boolean,
        default: true,
      },
      user_reports: {
        type: Boolean,
        default: true,
      },

      // Common
      promotional_messages: {
        type: Boolean,
        default: true,
      },
      broadcast_messages: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  },
);

const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema,
);

module.exports = NotificationSettings;
