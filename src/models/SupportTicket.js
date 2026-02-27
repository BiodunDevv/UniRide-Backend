const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     SupportTicket:
 *       type: object
 *       required:
 *         - subject
 *         - category
 *       properties:
 *         ticket_number:
 *           type: string
 *           description: Auto-generated ticket number (e.g. TKT-00001)
 *         user_id:
 *           type: string
 *           description: Reference to the user who created the ticket (optional for guest tickets)
 *         guest_name:
 *           type: string
 *           description: Name of the guest submitter (when no user account exists)
 *         guest_email:
 *           type: string
 *           description: Email of the guest submitter
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
    ticket_number: {
      type: String,
      unique: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    guest_name: {
      type: String,
      trim: true,
    },
    guest_email: {
      type: String,
      trim: true,
      lowercase: true,
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
        },
        sender_name: {
          type: String,
          trim: true,
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
  },
);

// Auto-generate ticket number before saving
supportTicketSchema.pre("save", async function (next) {
  if (!this.ticket_number) {
    const count = await mongoose.model("SupportTicket").countDocuments();
    this.ticket_number = `TKT-${String(count + 1).padStart(5, "0")}`;
  }
  next();
});

// Index for faster queries
supportTicketSchema.index({ user_id: 1, status: 1 });
supportTicketSchema.index({ assigned_to: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1 });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

module.exports = SupportTicket;
