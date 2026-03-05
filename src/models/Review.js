const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         is_featured:
 *           type: boolean
 *         is_approved:
 *           type: boolean
 */
const reviewSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
      trim: true,
    },
    is_featured: {
      type: Boolean,
      default: false,
    },
    is_approved: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// A user can only leave one review
reviewSchema.index({ user_id: 1 }, { unique: true });
reviewSchema.index({ is_featured: 1, is_approved: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
