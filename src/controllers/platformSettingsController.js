const PlatformSettings = require("../models/PlatformSettings");
const FarePolicy = require("../models/FarePolicy");
const { getIO } = require("../utils/socketManager");

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_SUPPORT_EMAIL = "support@uniride.ng";
const DEFAULT_SUPPORT_PHONE = "+234 (0) 800-UNIRIDE";

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function normalizeSettingsPayload(settingsDoc) {
  const data = settingsDoc.toObject ? settingsDoc.toObject() : settingsDoc;
  const mobileMapEnabled =
    data.mobile_map_enabled ?? data.expo_maps_enabled ?? true;
  const supportEmail = String(
    data.support_email || DEFAULT_SUPPORT_EMAIL,
  ).trim();
  const supportPhone = String(
    data.support_phone || DEFAULT_SUPPORT_PHONE,
  ).trim();

  return {
    ...data,
    expo_maps_enabled: Boolean(mobileMapEnabled),
    mobile_map_enabled: Boolean(mobileMapEnabled),
    mobile_map_provider:
      data.mobile_map_provider === "mapbox" ? "mapbox" : "native",
    mobile_map_3d_enabled: Boolean(data.mobile_map_3d_enabled),
    mobile_navigation_enabled: Boolean(data.mobile_navigation_enabled),
    support_email: supportEmail || DEFAULT_SUPPORT_EMAIL,
    support_phone: supportPhone || DEFAULT_SUPPORT_PHONE,
  };
}

function emitPlatformSettingsUpdate(settingsDoc, changedKeys = []) {
  try {
    const io = getIO();
    const normalized = normalizeSettingsPayload(settingsDoc);

    io.emit("platform-settings:updated", {
      changedKeys,
      settings: {
        expo_maps_enabled: normalized.expo_maps_enabled,
        mobile_map_enabled: normalized.mobile_map_enabled,
        mobile_map_provider: normalized.mobile_map_provider,
        mobile_map_3d_enabled: normalized.mobile_map_3d_enabled,
        mobile_navigation_enabled: normalized.mobile_navigation_enabled,
        fare_per_seat: normalized.fare_per_seat,
        maintenance_mode: normalized.maintenance_mode,
        app_version_minimum: normalized.app_version_minimum,
        max_seats_per_booking: normalized.max_seats_per_booking,
        allow_ride_without_driver: normalized.allow_ride_without_driver,
        auto_accept_bookings: normalized.auto_accept_bookings,
        support_email: normalized.support_email,
        support_phone: normalized.support_phone,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(
      "[PlatformSettings] socket broadcast skipped:",
      error?.message || "socket unavailable",
    );
  }
}

// ─── Get Platform Settings (public — mobile apps poll this) ─────────────────
const getPlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSettings.getSettings();
    const mobileMapEnabled =
      settings.mobile_map_enabled ?? settings.expo_maps_enabled;
    const mobileMapProvider =
      settings.mobile_map_provider === "mapbox" ? "mapbox" : "native";

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
        expo_maps_enabled: Boolean(mobileMapEnabled),
        mobile_map_enabled: Boolean(mobileMapEnabled),
        mobile_map_provider: mobileMapProvider,
        mobile_map_3d_enabled: Boolean(settings.mobile_map_3d_enabled),
        mobile_navigation_enabled: Boolean(settings.mobile_navigation_enabled),
        fare_per_seat: settings.fare_per_seat,
        maintenance_mode: settings.maintenance_mode,
        app_version_minimum: settings.app_version_minimum,
        max_seats_per_booking: settings.max_seats_per_booking,
        allow_ride_without_driver: settings.allow_ride_without_driver,
        auto_accept_bookings: settings.auto_accept_bookings,
        support_email:
          String(settings.support_email || DEFAULT_SUPPORT_EMAIL).trim() ||
          DEFAULT_SUPPORT_EMAIL,
        support_phone:
          String(settings.support_phone || DEFAULT_SUPPORT_PHONE).trim() ||
          DEFAULT_SUPPORT_PHONE,
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
    res.status(200).json({
      success: true,
      data: normalizeSettingsPayload(settings),
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update Platform Settings (admin only) ──────────────────────────────────
const updatePlatformSettings = async (req, res, next) => {
  try {
    const allowedFields = [
      "expo_maps_enabled",
      "mobile_map_enabled",
      "mobile_map_provider",
      "mobile_map_3d_enabled",
      "mobile_navigation_enabled",
      "fare_per_seat",
      "maintenance_mode",
      "app_version_minimum",
      "max_seats_per_booking",
      "allow_ride_without_driver",
      "auto_accept_bookings",
      "support_email",
      "support_phone",
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const booleanFields = [
      "expo_maps_enabled",
      "mobile_map_enabled",
      "mobile_map_3d_enabled",
      "mobile_navigation_enabled",
      "fare_per_seat",
      "maintenance_mode",
      "allow_ride_without_driver",
      "auto_accept_bookings",
    ];

    for (const field of booleanFields) {
      if (updates[field] !== undefined) {
        updates[field] = toBoolean(updates[field]);
      }
    }

    if (updates.mobile_map_provider !== undefined) {
      updates.mobile_map_provider =
        updates.mobile_map_provider === "mapbox" ? "mapbox" : "native";
    }

    if (updates.mobile_map_enabled !== undefined) {
      updates.mobile_map_enabled = Boolean(updates.mobile_map_enabled);
      updates.expo_maps_enabled = Boolean(updates.mobile_map_enabled);
    } else if (updates.expo_maps_enabled !== undefined) {
      updates.expo_maps_enabled = Boolean(updates.expo_maps_enabled);
      updates.mobile_map_enabled = Boolean(updates.expo_maps_enabled);
    }

    if (updates.app_version_minimum !== undefined) {
      const normalizedVersion = String(updates.app_version_minimum).trim();
      if (!SEMVER_PATTERN.test(normalizedVersion)) {
        return res.status(400).json({
          success: false,
          message:
            "app_version_minimum must use semantic version format like 1.2.3",
        });
      }
      updates.app_version_minimum = normalizedVersion;
    }

    if (updates.max_seats_per_booking !== undefined) {
      const parsedSeats = Number(updates.max_seats_per_booking);
      if (
        !Number.isInteger(parsedSeats) ||
        parsedSeats < 1 ||
        parsedSeats > 10
      ) {
        return res.status(400).json({
          success: false,
          message: "max_seats_per_booking must be an integer between 1 and 10",
        });
      }
      updates.max_seats_per_booking = parsedSeats;
    }

    if (updates.support_email !== undefined) {
      const normalizedEmail = String(updates.support_email)
        .trim()
        .toLowerCase();
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "support_email must be a valid email address",
        });
      }
      updates.support_email = normalizedEmail;
    }

    if (updates.support_phone !== undefined) {
      const normalizedPhone = String(updates.support_phone).trim();
      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          message: "support_phone cannot be empty",
        });
      }
      updates.support_phone = normalizedPhone;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    updates.updated_by = req.user._id;
    const changedKeys = Object.keys(updates).filter(
      (key) => key !== "updated_by",
    );

    const settings = await PlatformSettings.getSettings();
    Object.assign(settings, updates);
    await settings.save();

    emitPlatformSettingsUpdate(settings, changedKeys);

    res.status(200).json({
      success: true,
      message: "Platform settings updated successfully",
      data: normalizeSettingsPayload(settings),
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
