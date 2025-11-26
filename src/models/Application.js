const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     Application:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
 *         - drivers_license_url
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         vehicle_model:
 *           type: string
 *         plate_number:
 *           type: string
 *         drivers_license_url:
 *           type: string
 *           description: Cloudinary URL
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         rejection_reason:
 *           type: string
 */

const applicationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [/^[0-9+\-\s()]+$/, "Please provide a valid phone number"],
    },
    vehicle_model: {
      type: String,
      trim: true,
      maxlength: [100, "Vehicle model cannot exceed 100 characters"],
    },
    plate_number: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "Plate number cannot exceed 20 characters"],
    },
    drivers_license_url: {
      type: String,
      required: [true, "Driver's license URL is required"],
      trim: true,
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
      ref: "Admin",
    },
    reviewed_at: {
      type: Date,
    },
    rejection_reason: {
      type: String,
      trim: true,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes (email already has unique:true which creates index)
applicationSchema.index({ status: 1 });
applicationSchema.index({ submitted_at: -1 });

module.exports = mongoose.model("Application", applicationSchema);
