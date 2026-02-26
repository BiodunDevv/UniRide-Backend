const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     Driver:
 *       type: object
 *       required:
 *         - user_id
 *         - phone
 *         - vehicle_model
 *         - plate_number
 *       properties:
 *         user_id:
 *           type: string
 *         phone:
 *           type: string
 *         vehicle_model:
 *           type: string
 *         plate_number:
 *           type: string
 *         available_seats:
 *           type: number
 *         drivers_license:
 *           type: string
 *         vehicle_image:
 *           type: string
 *           description: URL to uploaded vehicle photo (optional)
 *         vehicle_color:
 *           type: string
 *           description: Color of the vehicle
 *         vehicle_description:
 *           type: string
 *           description: Additional description of the vehicle
 *         application_status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         approved_by:
 *           type: string
 *         approval_date:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [inactive, active]
 *         rating:
 *           type: number
 *         bank_name:
 *           type: string
 *         bank_account_number:
 *           type: string
 *         bank_account_name:
 *           type: string
 */

const driverSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
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
      unique: true,
      uppercase: true,
      trim: true,
    },
    available_seats: {
      type: Number,
      default: 4,
      min: 1,
      max: 8,
    },
    drivers_license: {
      type: String, // URL from frontend/cloudinary
      required: [true, "Driver license is required"],
    },
    vehicle_image: {
      type: String, // URL from frontend/cloudinary (optional vehicle photo)
    },
    vehicle_color: {
      type: String,
      trim: true,
    },
    vehicle_description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    application_status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approval_date: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["inactive", "active"],
      default: "inactive",
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    total_ratings: {
      type: Number,
      default: 0,
    },
    bank_name: {
      type: String,
      trim: true,
    },
    bank_account_number: {
      type: String,
      trim: true,
    },
    bank_account_name: {
      type: String,
      trim: true,
    },
    license_last_updated: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Method to update rating
driverSchema.methods.updateRating = function (newRating) {
  const totalRatings = this.total_ratings;
  const currentRating = this.rating;

  this.total_ratings = totalRatings + 1;
  this.rating = (currentRating * totalRatings + newRating) / this.total_ratings;

  return this.save();
};

const Driver = mongoose.model("Driver", driverSchema);

module.exports = Driver;
