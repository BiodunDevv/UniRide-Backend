const mongoose = require("mongoose");

const accountDeletionVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    intent: {
      type: String,
      enum: ["request", "cancel"],
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      select: false,
    },
    code_expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    verification_token: {
      type: String,
      default: null,
      select: false,
      index: true,
    },
    token_expires_at: {
      type: Date,
      default: null,
      index: true,
    },
    verified_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

accountDeletionVerificationSchema.index(
  { email: 1, intent: 1, createdAt: -1 },
  { name: "email_intent_createdAt_idx" },
);

module.exports = mongoose.model(
  "AccountDeletionVerification",
  accountDeletionVerificationSchema,
);
