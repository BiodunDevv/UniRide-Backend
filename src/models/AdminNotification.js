const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "driver_application",
        "support_ticket",
        "ride_issue",
        "user_report",
        "system_alert",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "reference_model",
    },
    reference_model: {
      type: String,
      enum: ["DriverApplication", "SupportTicket", "Ride", "User"],
    },
    is_read: {
      type: Boolean,
      default: false,
    },
    read_by: [
      {
        admin_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        read_at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
adminNotificationSchema.index({ is_read: 1, createdAt: -1 });
adminNotificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
