const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       required:
 *         - ride_id
 *         - student_id
 *         - no_of_seats
 *       properties:
 *         ride_id:
 *           type: string
 *         student_id:
 *           type: string
 *         no_of_seats:
 *           type: number
 *           minimum: 1
 *           maximum: 4
 *         payment_method:
 *           type: string
 *           enum: [cash, transfer]
 *         payment_status:
 *           type: string
 *           enum: [pending, paid, not_applicable]
 *         bank_details_visible:
 *           type: boolean
 *         check_in_status:
 *           type: string
 *           enum: [not_checked_in, checked_in]
 *         status:
 *           type: string
 *           enum: [active, accepted, in_progress, completed, missed, cancelled]
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 */

const bookingSchema = new mongoose.Schema(
  {
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: [true, 'Ride ID is required'],
      index: true,
    },
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID is required'],
      index: true,
    },
    no_of_seats: {
      type: Number,
      required: [true, 'Number of seats is required'],
      min: [1, 'Number of seats must be at least 1'],
      max: [4, 'Number of seats cannot exceed 4'],
    },
    payment_method: {
      type: String,
      enum: ['cash', 'transfer'],
      required: [true, 'Payment method is required'],
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'not_applicable'],
      default: 'pending',
    },
    bank_details_visible: {
      type: Boolean,
      default: false, // Only true after booking is accepted
    },
    booking_time: {
      type: Date,
      default: Date.now,
    },
    check_in_status: {
      type: String,
      enum: ['not_checked_in', 'checked_in'],
      default: 'not_checked_in',
    },
    check_in_time: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'accepted', 'in_progress', 'completed', 'missed', 'cancelled'],
      default: 'active',
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    review: {
      type: String,
      trim: true,
      maxlength: [500, 'Review cannot exceed 500 characters'],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes
bookingSchema.index({ ride_id: 1, student_id: 1 });
bookingSchema.index({ student_id: 1, status: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ booking_time: -1 });

// Compound index to prevent duplicate active bookings
bookingSchema.index(
  { ride_id: 1, student_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['active', 'accepted', 'in_progress'] } },
  }
);

// Method to check in
bookingSchema.methods.checkIn = function () {
  this.check_in_status = 'checked_in';
  this.check_in_time = new Date();
};

// Method to mark as missed
bookingSchema.methods.markAsMissed = function () {
  this.status = 'missed';
};

// Ensure virtuals are included in JSON
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Booking', bookingSchema);
