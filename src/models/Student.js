const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

/**
 * @swagger
 * components:
 *   schemas:
 *     Student:
 *       type: object
 *       required:
 *         - matric_no
 *         - email
 *         - college_id
 *         - department_id
 *         - level
 *       properties:
 *         matric_no:
 *           type: string
 *           description: Unique matriculation number
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         college_id:
 *           type: string
 *         department_id:
 *           type: string
 *         level:
 *           type: number
 *           enum: [100, 200, 300, 400, 500, 600]
 *         device_id:
 *           type: string
 *         biometric_enabled:
 *           type: boolean
 *         first_login:
 *           type: boolean
 *         is_flagged:
 *           type: boolean
 */

const studentSchema = new mongoose.Schema(
  {
    matric_no: {
      type: String,
      required: [true, "Matriculation number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    first_name: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    last_name: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid university email"],
    },
    college_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: [true, "College is required"],
      index: true,
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required"],
      index: true,
    },
    level: {
      type: Number,
      required: [true, "Level is required"],
      enum: {
        values: [100, 200, 300, 400, 500, 600],
        message: "Level must be 100, 200, 300, 400, 500, or 600",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    device_id: {
      type: String,
      unique: true,
      sparse: true, // Allow null but enforce uniqueness when set
      trim: true,
    },
    biometric_enabled: {
      type: Boolean,
      default: false,
    },
    requires_password_change: {
      type: Boolean,
      default: false,
    },
    first_login: {
      type: Boolean,
      default: true,
    },
    is_flagged: {
      type: Boolean,
      default: false,
    },
    password_reset_token: {
      type: String,
      select: false,
    },
    password_reset_expires: {
      type: Date,
      select: false,
    },
    ride_history: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
      },
    ],
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes (matric_no, email, device_id already have unique:true which creates index)
studentSchema.index({ college_id: 1, department_id: 1, level: 1 });

// Hash password before saving
studentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
studentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for full name
studentSchema.virtual("full_name").get(function () {
  return `${this.first_name} ${this.last_name}`;
});

// Ensure virtuals are included in JSON
studentSchema.set("toJSON", { virtuals: true });
studentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Student", studentSchema);
