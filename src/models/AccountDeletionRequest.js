const mongoose = require("mongoose");

const accountDeletionRequestSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "driver"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "pending_review",
        "scheduled",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "pending_review",
      index: true,
    },
    requested_via: {
      type: String,
      enum: ["mobile", "web_public", "admin"],
      default: "web_public",
    },
    request_reason: {
      type: String,
      maxlength: 500,
      trim: true,
      default: "",
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    review_note: {
      type: String,
      maxlength: 500,
      trim: true,
      default: "",
    },
    scheduled_for: {
      type: Date,
      default: null,
      index: true,
    },
    cancelled_at: {
      type: Date,
      default: null,
    },
    completed_at: {
      type: Date,
      default: null,
    },
    completion_summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

accountDeletionRequestSchema.index(
  { user_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending_review", "scheduled"] },
    },
  },
);

module.exports = mongoose.model(
  "AccountDeletionRequest",
  accountDeletionRequestSchema,
);
