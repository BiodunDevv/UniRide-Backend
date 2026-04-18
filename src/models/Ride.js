const mongoose = require("mongoose");

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
 *         - fare
 *       properties:
 *         driver_id:
 *           type: string
 *         pickup_location:
 *           type: object
 *         destination:
 *           type: object
 *         fare:
 *           type: number
 *         fare_policy_source:
 *           type: string
 *           enum: [admin, driver, distance_auto]
 *         departure_time:
 *           type: string
 *           format: date-time
 *         available_seats:
 *           type: number
 *         booked_seats:
 *           type: number
 *         status:
 *           type: string
 *           enum: [available, accepted, in_progress, completed, cancelled]
 *         gps_tracking_enabled:
 *           type: boolean
 *         route_geometry:
 *           type: object
 *         distance_meters:
 *           type: number
 *         duration_seconds:
 *           type: number
 *         check_in_code:
 *           type: string
 */

const rideSchema = new mongoose.Schema(
  {
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    pickup_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampusLocation",
    },
    destination_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampusLocation",
    },
    pickup_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
      },
    },
    destination: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
      },
    },
    fare: {
      type: Number,
      required: true,
      min: 0,
    },
    fare_policy_source: {
      type: String,
      enum: ["admin", "driver", "distance_auto"],
      default: "admin",
    },
    departure_time: {
      type: Date,
      required: true,
    },
    available_seats: {
      type: Number,
      required: true,
      min: 1,
    },
    booked_seats: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "scheduled",
        "available",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "scheduled",
    },
    gps_tracking_enabled: {
      type: Boolean,
      default: true,
    },
    route_geometry: {
      type: Object, // GeoJSON from OpenRouteService
    },
    distance_meters: {
      type: Number,
    },
    duration_seconds: {
      type: Number,
    },
    check_in_code: {
      type: String,
      length: 4,
    },
    current_location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude] - updated in real-time
        default: undefined,
      },
    },
    started_at: {
      type: Date,
    },
    ended_at: {
      type: Date,
    },
    cancelled_at: {
      type: Date,
    },
    cancelled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancel_reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

// Index for geospatial queries
rideSchema.index({ pickup_location: "2dsphere" });
rideSchema.index({ destination: "2dsphere" });
rideSchema.index({ current_location: "2dsphere" });

// Index for status queries
rideSchema.index({ status: 1, departure_time: 1 });

const Ride = mongoose.model("Ride", rideSchema);

module.exports = Ride;
