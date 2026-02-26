const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     UserNotification:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         type:
 *           type: string
 *           enum: [broadcast, ride, booking, system, promotion]
 *         is_read:
 *           type: boolean
 *         metadata:
 *           type: object
 */
const userNotificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "broadcast",
        "ride",
        "booking",
        "system",
        "promotion",
        "security",
        "account",
      ],
      default: "system",
    },
    is_read: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

userNotificationSchema.index({ user_id: 1, createdAt: -1 });
userNotificationSchema.index({ user_id: 1, is_read: 1 });

module.exports = mongoose.model("UserNotification", userNotificationSchema);
