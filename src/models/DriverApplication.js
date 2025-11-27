const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     DriverApplication:
 *       type: object
 *       required:
 *         - user_id
 *         - vehicle_model
 *         - plate_number
 *         - drivers_license
 *       properties:
 *         user_id:
 *           type: string
 *         vehicle_model:
 *           type: string
 *         plate_number:
 *           type: string
 *         drivers_license:
 *           type: string
 *           description: URL to uploaded driver's license image
 *         phone:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         submitted_at:
 *           type: string
 *           format: date-time
 *         reviewed_by:
 *           type: string
 *         reviewed_at:
 *           type: string
 *           format: date-time
 *         rejection_reason:
 *           type: string
 */

const driverApplicationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional - will be linked when approved
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    vehicle_model: {
      type: String,
      required: [true, "Vehicle model is required"],
      trim: true,
    },
    plate_number: {
      type: String,
      required: [true, "Plate number is required"],
      uppercase: true,
      trim: true,
    },
    drivers_license: {
      type: String, // URL from frontend/cloudinary (image upload)
      required: [true, "Driver's license image URL is required"],
      validate: {
        validator: function (v) {
          // Basic URL validation
          return /^https?:\/\/.+/.test(v);
        },
        message: "Driver's license must be a valid URL to the uploaded image",
      },
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    available_seats: {
      type: Number,
      default: 4,
      min: 1,
      max: 8,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submitted_at: {
      type: Date,
      default: Date.now,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who reviewed
    },
    reviewed_at: {
      type: Date,
    },
    rejection_reason: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick status queries
driverApplicationSchema.index({ status: 1, submitted_at: -1 });

// Index on email to prevent duplicate applications (unique per email)
driverApplicationSchema.index({ email: 1 }, { unique: true });

const DriverApplication = mongoose.model(
  "DriverApplication",
  driverApplicationSchema
);

module.exports = DriverApplication;
