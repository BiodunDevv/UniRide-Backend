const mongoose = require("mongoose");

/**
 * FarePolicy - Admin-controlled settings for fare calculation
 */
const farePolicySchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["admin", "driver", "distance_auto"],
      default: "admin",
    },
    base_fare: {
      type: Number,
      default: 500, // Base fare in currency
      min: 0,
    },
    per_km_rate: {
      type: Number,
      default: 50, // Rate per kilometer
      min: 0,
    },
    per_minute_rate: {
      type: Number,
      default: 10, // Rate per minute
      min: 0,
    },
    minimum_fare: {
      type: Number,
      default: 200,
      min: 0,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const FarePolicy = mongoose.model("FarePolicy", farePolicySchema);

module.exports = FarePolicy;
