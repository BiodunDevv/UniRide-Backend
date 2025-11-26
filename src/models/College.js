const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     College:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: College name (unique)
 *         code:
 *           type: string
 *           description: Optional short code for the college
 *         created_by:
 *           type: string
 *           description: Admin ID who created the college
 *         created_at:
 *           type: string
 *           format: date-time
 */

const collegeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "College name is required"],
      unique: true,
      trim: true,
      maxlength: [200, "College name cannot exceed 200 characters"],
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, "College code cannot exceed 20 characters"],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes (name already has unique:true which creates index)
collegeSchema.index({ code: 1 });

// Virtual for departments
collegeSchema.virtual("departments", {
  ref: "Department",
  localField: "_id",
  foreignField: "college_id",
});

module.exports = mongoose.model("College", collegeSchema);
