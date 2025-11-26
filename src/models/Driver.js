const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

/**
 * @swagger
 * components:
 *   schemas:
 *     Driver:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
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
 *         available_seats:
 *           type: number
 *         drivers_license_url:
 *           type: string
 *         application_status:
 *           type: string
 *           enum: [pending, approved, rejected]
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
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
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
    available_seats: {
      type: Number,
      default: 4,
      min: [1, "Available seats must be at least 1"],
      max: [8, "Available seats cannot exceed 8"],
    },
    drivers_license_url: {
      type: String,
      trim: true,
    },
    application_status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    approval_date: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["inactive", "active"],
      default: "inactive", // Active only after first login and password change
    },
    first_login: {
      type: Boolean,
      default: true,
    },
    password_reset_token: {
      type: String,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      select: false,
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be less than 0"],
      max: [5, "Rating cannot exceed 5"],
    },
    total_rides: {
      type: Number,
      default: 0,
    },
    bank_name: {
      type: String,
      trim: true,
      maxlength: [100, "Bank name cannot exceed 100 characters"],
    },
    bank_account_number: {
      type: String,
      trim: true,
      maxlength: [20, "Bank account number cannot exceed 20 characters"],
    },
    bank_account_name: {
      type: String,
      trim: true,
      maxlength: [100, "Bank account name cannot exceed 100 characters"],
    },
    current_location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    last_location_update: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes (email already has unique:true which creates index)
driverSchema.index({ status: 1 });
driverSchema.index({ current_location: "2dsphere" }); // Geospatial index
driverSchema.index({ application_status: 1 });

// Hash password before saving
driverSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
driverSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update location
driverSchema.methods.updateLocation = function (longitude, latitude) {
  this.current_location = {
    type: "Point",
    coordinates: [longitude, latitude],
  };
  this.last_location_update = new Date();
};

// Ensure virtuals are included in JSON
driverSchema.set("toJSON", { virtuals: true });
driverSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Driver", driverSchema);
