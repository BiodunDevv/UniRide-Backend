const mongoose = require("mongoose");

const broadcastMessageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    target_audience: {
      type: String,
      enum: ["all", "users", "drivers", "admins"],
      default: "all",
    },
    sent_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sent_by_name: {
      type: String,
    },
    notification_type: {
      type: String,
      enum: ["push", "email", "both"],
      default: "both",
    },
    total_recipients: {
      type: Number,
      default: 0,
    },
    successful_sends: {
      type: Number,
      default: 0,
    },
    failed_sends: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "sending", "completed", "failed"],
      default: "pending",
    },
    scheduled_for: {
      type: Date,
    },
    completed_at: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for filtering
broadcastMessageSchema.index({ target_audience: 1, status: 1, createdAt: -1 });

const BroadcastMessage = mongoose.model(
  "BroadcastMessage",
  broadcastMessageSchema
);

module.exports = BroadcastMessage;
