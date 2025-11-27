const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       required:
 *         - ride_id
 *         - user_id
 *         - payment_method
 *       properties:
 *         ride_id:
 *           type: string
 *         user_id:
 *           type: string
 *         payment_method:
 *           type: string
 *           enum: [cash, transfer]
 *         payment_status:
 *           type: string
 *           enum: [pending, paid, not_applicable]
 *         bank_details_visible:
 *           type: boolean
 *         booking_time:
 *           type: string
 *           format: date-time
 *         check_in_status:
 *           type: string
 *           enum: [not_checked_in, checked_in]
 *         status:
 *           type: string
 *           enum: [active, accepted, in_progress, completed, cancelled]
 *         rating:
 *           type: number
 */

const bookingSchema = new mongoose.Schema(
  {
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    payment_method: {
      type: String,
      enum: ["cash", "transfer"],
      required: true,
    },
    payment_status: {
      type: String,
      enum: ["pending", "paid", "not_applicable"],
      default: function () {
        return this.payment_method === "cash" ? "not_applicable" : "pending";
      },
    },
    bank_details_visible: {
      type: Boolean,
      default: false, // Only visible after booking confirmation
    },
    booking_time: {
      type: Date,
      default: Date.now,
    },
    check_in_status: {
      type: String,
      enum: ["not_checked_in", "checked_in"],
      default: "not_checked_in",
    },
    status: {
      type: String,
      enum: ["active", "accepted", "in_progress", "completed", "cancelled"],
      default: "active",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user's bookings
bookingSchema.index({ user_id: 1, status: 1 });
bookingSchema.index({ ride_id: 1, status: 1 });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
