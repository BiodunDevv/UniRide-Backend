const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     SupportTicket:
 *       type: object
 *       required:
 *         - user_id
 *         - subject
 *         - category
 *       properties:
 *         user_id:
 *           type: string
 *           description: Reference to the user who created the ticket
 *         subject:
 *           type: string
 *           description: Subject of the support ticket
 *         category:
 *           type: string
 *           enum: [account, payment, ride, technical, other]
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         status:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *         assigned_to:
 *           type: string
 *           description: Admin/support staff assigned to handle this ticket
 *         messages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               sender_id:
 *                 type: string
 *               sender_role:
 *                 type: string
 *               message:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *         resolved_at:
 *           type: string
 *           format: date-time
 *         closed_at:
 *           type: string
 *           format: date-time
 *         satisfaction_rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 */

const supportTicketSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      enum: ["account", "payment", "ride", "technical", "other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    messages: [
      {
        sender_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        sender_role: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolved_at: {
      type: Date,
    },
    closed_at: {
      type: Date,
    },
    satisfaction_rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    satisfaction_comment: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
supportTicketSchema.index({ user_id: 1, status: 1 });
supportTicketSchema.index({ assigned_to: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1 });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

module.exports = SupportTicket;
