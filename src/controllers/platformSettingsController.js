const PlatformSettings = require("../models/PlatformSettings");
const FarePolicy = require("../models/FarePolicy");

// ─── Get Platform Settings (public — mobile apps poll this) ─────────────────
const getPlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getSettings();

    // Also fetch fare policy so mobile can display fare info
    let farePolicy = null;
    try {
      const fp = await FarePolicy.findOne().sort({ updatedAt: -1 });
      if (fp) {
        farePolicy = {
          mode: fp.mode,
          base_fare: fp.base_fare,
          minimum_fare: fp.minimum_fare,
          per_km_rate: fp.per_km_rate,
        };
      }
    } catch (_) {
      // If fare policy doesn't exist yet, that's fine
    }

    res.status(200).json({
      success: true,
      data: {
        map_provider: settings.map_provider,
        mapbox_enabled: settings.mapbox_enabled,
        expo_maps_enabled: settings.expo_maps_enabled,
        fare_per_seat: settings.fare_per_seat,
        maintenance_mode: settings.maintenance_mode,
        app_version_minimum: settings.app_version_minimum,
        max_seats_per_booking: settings.max_seats_per_booking,
        allow_ride_without_driver: settings.allow_ride_without_driver,
        auto_accept_bookings: settings.auto_accept_bookings,
        fare_policy: farePolicy,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Full Platform Settings (admin only) ────────────────────────────────
const getFullPlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

// ─── Update Platform Settings (admin only) ──────────────────────────────────
const updatePlatformSettings = async (req, res, next) => {
  try {
    const allowedFields = [
      "map_provider",
      "mapbox_enabled",
      "expo_maps_enabled",
      "fare_per_seat",
      "maintenance_mode",
      "app_version_minimum",
      "max_seats_per_booking",
      "allow_ride_without_driver",
      "auto_accept_bookings",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    updates.updated_by = req.user._id;

    const settings = await PlatformSettings.getSettings();
    Object.assign(settings, updates);
    await settings.save();

    res.status(200).json({
      success: true,
      message: "Platform settings updated successfully",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlatformSettings,
  getFullPlatformSettings,
  updatePlatformSettings,
};
