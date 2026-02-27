const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - name
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *         device_id:
 *           type: string
 *         biometric_enabled:
 *           type: boolean
 *         is_flagged:
 *           type: boolean
 *         ride_history:
 *           type: array
 *           items:
 *             type: string
 *         role:
 *           type: string
 *           enum: [user, driver, admin, super_admin]
 *         first_login:
 *           type: boolean
 */

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    profile_picture: {
      type: String, // Cloudinary URL
      default: null,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Don't return password by default
    },
    device_id: {
      type: String,
      unique: true,
      sparse: true, // Allows null values while maintaining uniqueness (deprecated - kept for backward compatibility)
    },
    devices: [
      {
        device_id: {
          type: String,
          required: true,
        },
        device_name: {
          type: String,
          default: "Unknown Device",
        },
        device_type: {
          type: String,
          enum: ["mobile", "tablet", "desktop", "other"],
          default: "other",
        },
        last_login: {
          type: Date,
          default: Date.now,
        },
        ip_address: {
          type: String,
        },
        user_agent: {
          type: String,
        },
      },
    ],
    biometric_enabled: {
      type: Boolean,
      default: false,
    },
    pin_enabled: {
      type: Boolean,
      default: false,
    },
    pin_hash: {
      type: String,
      select: false,
    },
    pin_reset_code: {
      type: String,
      select: false,
    },
    pin_reset_expires: {
      type: Date,
      select: false,
    },
    is_flagged: {
      type: Boolean,
      default: false,
    },
    ride_history: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
      },
    ],
    role: {
      type: String,
      enum: ["user", "driver", "admin", "super_admin"],
      default: "user",
    },
    first_login: {
      type: Boolean,
      default: true,
    },
    email_verified: {
      type: Boolean,
      default: false,
    },
    email_verification_code: {
      type: String,
      select: false,
    },
    email_verification_expires: {
      type: Date,
      select: false,
    },
    password_reset_code: {
      type: String,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      select: false,
    },
    preferred_language: {
      type: String,
      default: "en",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
