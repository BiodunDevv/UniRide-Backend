const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const { getIO } = require("../utils/socketManager");

const AUTO_OFFLINE_AFTER_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

let intervalId = null;

function resolveLastKnownLocation(driver) {
  if (
    driver.current_location &&
    Array.isArray(driver.current_location.coordinates) &&
    driver.current_location.coordinates.length === 2
  ) {
    return {
      type: "Point",
      coordinates: driver.current_location.coordinates,
    };
  }

  if (
    driver.last_known_location &&
    Array.isArray(driver.last_known_location.coordinates) &&
    driver.last_known_location.coordinates.length === 2
  ) {
    return {
      type: "Point",
      coordinates: driver.last_known_location.coordinates,
      address: driver.last_known_location.address || "",
    };
  }

  return undefined;
}

const autoOfflineInactiveDrivers = async () => {
  try {
    const cutoff = new Date(Date.now() - AUTO_OFFLINE_AFTER_MS);

    const staleOnlineDrivers = await Driver.find({
      is_online: true,
      application_status: "approved",
      last_online_at: { $lt: cutoff },
    }).select(
      "_id user_id current_location last_known_location last_online_at",
    );

    if (staleOnlineDrivers.length === 0) return;

    const staleDriverIds = staleOnlineDrivers.map((driver) => driver._id);

    const driversWithActiveRides = await Ride.find({
      driver_id: { $in: staleDriverIds },
      status: { $in: ["accepted", "in_progress"] },
    })
      .select("driver_id")
      .lean();

    const activeDriverIdSet = new Set(
      driversWithActiveRides.map((ride) => String(ride.driver_id)),
    );

    const driversToAutoOffline = staleOnlineDrivers.filter(
      (driver) => !activeDriverIdSet.has(String(driver._id)),
    );

    if (driversToAutoOffline.length === 0) return;

    const now = new Date();
    const bulkOperations = driversToAutoOffline.map((driver) => ({
      updateOne: {
        filter: { _id: driver._id, is_online: true },
        update: {
          $set: {
            is_online: false,
            status: "inactive",
            last_known_location: resolveLastKnownLocation(driver),
          },
        },
      },
    }));

    await Driver.bulkWrite(bulkOperations);

    try {
      const io = getIO();
      for (const driver of driversToAutoOffline) {
        io.emit("driver-offline", {
          driver_id: driver._id,
          user_id: driver.user_id,
          last_known_location: resolveLastKnownLocation(driver),
          timestamp: now,
          reason: "inactive_timeout",
        });
      }
    } catch (socketError) {
      console.warn(
        "[DriverPresenceScheduler] socket emit skipped:",
        socketError?.message || "socket unavailable",
      );
    }

    const skippedWithActiveRide =
      staleOnlineDrivers.length - driversToAutoOffline.length;
    console.log(
      `⏱️ Auto-offlined ${driversToAutoOffline.length} inactive driver(s); skipped ${skippedWithActiveRide} with active ride(s).`,
    );
  } catch (error) {
    console.error("❌ Driver presence scheduler error:", error.message);
  }
};

const startDriverPresenceScheduler = () => {
  if (intervalId) return;

  console.log("⏱️ Driver presence scheduler started (checks every 60s)");
  autoOfflineInactiveDrivers();
  intervalId = setInterval(autoOfflineInactiveDrivers, CHECK_INTERVAL_MS);
};

const stopDriverPresenceScheduler = () => {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
  console.log("⏱️ Driver presence scheduler stopped");
};

module.exports = {
  startDriverPresenceScheduler,
  stopDriverPresenceScheduler,
  autoOfflineInactiveDrivers,
};
