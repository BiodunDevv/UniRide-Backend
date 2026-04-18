const mongoose = require("mongoose");

/**
 * PlatformSettings - Global platform configuration controlled by admin
 * Singleton pattern — only one document should exist
 */
const platformSettingsSchema = new mongoose.Schema(
  {
    // ─── Mobile Map Settings ────────────────────────────────────────
    expo_maps_enabled: {
      type: Boolean,
      default: true,
    },
    mobile_map_enabled: {
      type: Boolean,
      default: true,
    },
    mobile_map_provider: {
      type: String,
      enum: ["native", "mapbox"],
      default: "native",
    },
    mobile_map_3d_enabled: {
      type: Boolean,
      default: false,
    },
    mobile_navigation_enabled: {
      type: Boolean,
      default: false,
    },

    // ─── Fare Settings ──────────────────────────────────────────────
    fare_per_seat: {
      type: Boolean,
      default: true, // When true, fare is multiplied by seats booked
    },

    // ─── General Platform Settings ──────────────────────────────────
    maintenance_mode: {
      type: Boolean,
      default: false,
    },
    app_version_minimum: {
      type: String,
      default: "1.0.0",
    },
    max_seats_per_booking: {
      type: Number,
      default: 4,
      min: 1,
      max: 10,
    },
    allow_ride_without_driver: {
      type: Boolean,
      default: true, // Users can create ride requests without a driver
    },
    auto_accept_bookings: {
      type: Boolean,
      default: false,
    },

    // ─── Support Contact Settings ───────────────────────────────────
    support_email: {
      type: String,
      default: "support@uniride.ng",
      trim: true,
      lowercase: true,
    },
    support_phone: {
      type: String,
      default: "+234 (0) 800-UNIRIDE",
      trim: true,
    },

    // ─── Last updated by ────────────────────────────────────────────
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Ensure only one document exists
platformSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const PlatformSettings = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema,
);

module.exports = PlatformSettings;
