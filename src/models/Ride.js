const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Ride:
 *       type: object
 *       required:
 *         - driver_id
 *         - pickup_location
 *         - destination
 *       properties:
 *         driver_id:
 *           type: string
 *         pickup_location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *               enum: [Point]
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *             address:
 *               type: string
 *         destination:
 *           type: object
 *         fare:
 *           type: number
 *         departure_time:
 *           type: string
 *           format: date-time
 *         available_seats:
 *           type: number
 *         status:
 *           type: string
 *           enum: [available, accepted, en_route, arrived, in_progress, completed, cancelled, full]
 */

const rideSchema = new mongoose.Schema(
  {
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver ID is required'],
      index: true,
    },
    pickup_location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        trim: true,
      },
    },
    destination: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        trim: true,
      },
    },
    fare: {
      type: Number,
      required: [true, 'Fare is required'],
      min: [0, 'Fare cannot be negative'],
    },
    fare_policy_source: {
      type: String,
      enum: ['admin', 'driver', 'distance_auto'],
      default: 'admin',
    },
    departure_time: {
      type: Date,
      required: [true, 'Departure time is required'],
    },
    available_seats: {
      type: Number,
      required: [true, 'Available seats is required'],
      min: [1, 'Available seats must be at least 1'],
      max: [8, 'Available seats cannot exceed 8'],
    },
    booked_seats: {
      type: Number,
      default: 0,
      min: [0, 'Booked seats cannot be negative'],
    },
    status: {
      type: String,
      enum: ['available', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'full'],
      default: 'available',
    },
    gps_tracking_enabled: {
      type: Boolean,
      default: true,
    },
    route_geometry: {
      type: mongoose.Schema.Types.Mixed, // GeoJSON or encoded polyline
    },
    distance_meters: {
      type: Number,
      min: [0, 'Distance cannot be negative'],
    },
    duration_seconds: {
      type: Number,
      min: [0, 'Duration cannot be negative'],
    },
    check_in_code: {
      type: String,
      length: 4,
      match: [/^\d{4}$/, 'Check-in code must be 4 digits'],
    },
    check_in_code_expiry: {
      type: Date,
    },
    current_location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    ended_at: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes
rideSchema.index({ driver_id: 1, status: 1 });
rideSchema.index({ status: 1 });
rideSchema.index({ departure_time: 1 });
rideSchema.index({ pickup_location: '2dsphere' });
rideSchema.index({ destination: '2dsphere' });
rideSchema.index({ current_location: '2dsphere' });

// Virtual for bookings
rideSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'ride_id',
});

// Method to check if ride is full
rideSchema.methods.isFull = function () {
  return this.booked_seats >= this.available_seats;
};

// Method to update current location
rideSchema.methods.updateCurrentLocation = function (longitude, latitude) {
  this.current_location = {
    type: 'Point',
    coordinates: [longitude, latitude],
  };
};

// Ensure virtuals are included in JSON
rideSchema.set('toJSON', { virtuals: true });
rideSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Ride', rideSchema);
