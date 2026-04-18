#!/usr/bin/env node

require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const Driver = require("../models/Driver");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const UserNotification = require("../models/UserNotification");
const NotificationSettings = require("../models/NotificationSettings");

const USAGE =
  "Usage: npm run clear -- <email> [--dry-run] [--json]  OR  npm run clear:user -- <email> [--dry-run] [--json]  OR  node src/scripts/clearUserData.js <email> [--dry-run] [--json]";

function parseEmailArg(argv) {
  if (!argv.length) return null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      return "__HELP__";
    }

    if (arg === "--email" && argv[i + 1]) {
      return argv[i + 1];
    }

    if (arg.startsWith("--email=")) {
      return arg.split("=").slice(1).join("=");
    }

    if (!arg.startsWith("-")) {
      return arg;
    }
  }

  return null;
}

function uniqObjectIds(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) continue;
    const id = String(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(new mongoose.Types.ObjectId(id));
  }

  return result;
}

async function run() {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const dryRun = argv.includes("--dry-run");
  const rawEmail = parseEmailArg(
    argv.filter((arg) => arg !== "--dry-run" && arg !== "--json"),
  );

  const emitJson = (payload) => {
    if (!jsonOutput) return;
    console.log(JSON.stringify(payload));
  };

  const command = `node src/scripts/clearUserData.js ${String(rawEmail || "")
    .trim()
    .toLowerCase()}${dryRun ? " --dry-run" : ""}`;

  if (rawEmail === "__HELP__") {
    if (jsonOutput) {
      emitJson({ success: true, usage: USAGE });
    } else {
      console.log(USAGE);
    }
    return;
  }

  if (!rawEmail) {
    if (jsonOutput) {
      emitJson({
        success: false,
        message: "Missing email argument.",
        usage: USAGE,
      });
    } else {
      console.error("Missing email argument.");
      console.error(USAGE);
    }
    process.exitCode = 1;
    return;
  }

  if (!process.env.MONGODB_URI) {
    if (jsonOutput) {
      emitJson({
        success: false,
        message: "MONGODB_URI is not set in the environment.",
      });
    } else {
      console.error("MONGODB_URI is not set in the environment.");
    }
    process.exitCode = 1;
    return;
  }

  const email = String(rawEmail).trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    if (jsonOutput) {
      emitJson({ success: false, message: `Invalid email: ${email}` });
    } else {
      console.error(`Invalid email: ${email}`);
    }
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const user = await User.findOne({ email }).select("_id email role name");

    if (!user) {
      if (jsonOutput) {
        emitJson({ success: false, message: `No account found for ${email}` });
      } else {
        console.error(`No account found for ${email}`);
      }
      process.exitCode = 1;
      return;
    }

    const driverProfile = await Driver.findOne({ user_id: user._id }).select(
      "_id application_status",
    );

    const [createdRides, drivenRides, bookedRideIds] = await Promise.all([
      Ride.find({ created_by: user._id }).select("_id"),
      driverProfile
        ? Ride.find({ driver_id: driverProfile._id }).select("_id")
        : Promise.resolve([]),
      Booking.distinct("ride_id", { user_id: user._id }),
    ]);

    const rideIdsToDelete = uniqObjectIds([
      ...createdRides.map((r) => r._id),
      ...drivenRides.map((r) => r._id),
    ]);

    const bookingFilter = {
      $or: [
        { user_id: user._id },
        ...(rideIdsToDelete.length
          ? [{ ride_id: { $in: rideIdsToDelete } }]
          : []),
      ],
    };

    const [
      bookingsToDeleteCount,
      notificationsToDeleteCount,
      reviewsToDeleteCount,
    ] = await Promise.all([
      Booking.countDocuments(bookingFilter),
      UserNotification.countDocuments({ user_id: user._id }),
      Review.countDocuments({ user_id: user._id }),
    ]);

    if (dryRun) {
      const summary = {
        user: user.email,
        role: user.role,
        has_driver_profile: Boolean(driverProfile),
        rides_to_delete: rideIdsToDelete.length,
        bookings_to_delete: bookingsToDeleteCount,
        notifications_to_delete: notificationsToDeleteCount,
        reviews_to_delete: reviewsToDeleteCount,
      };

      if (jsonOutput) {
        emitJson({
          success: true,
          dry_run: true,
          command,
          summary,
        });
      } else {
        console.log("🧪 Dry run summary (no data deleted)");
        console.table(summary);
      }
      return;
    }

    const [
      deletedBookings,
      deletedRides,
      deletedNotifications,
      deletedReviews,
    ] = await Promise.all([
      Booking.deleteMany(bookingFilter),
      rideIdsToDelete.length
        ? Ride.deleteMany({ _id: { $in: rideIdsToDelete } })
        : Promise.resolve({ deletedCount: 0 }),
      UserNotification.deleteMany({ user_id: user._id }),
      Review.deleteMany({ user_id: user._id }),
    ]);

    await Promise.all([
      User.updateOne(
        { _id: user._id },
        {
          $set: {
            ride_history: [],
            devices: [],
            biometric_enabled: false,
            pin_enabled: false,
            is_flagged: false,
          },
          $unset: {
            device_id: "",
            pin_hash: "",
            pin_reset_code: "",
            pin_reset_expires: "",
            current_location: "",
          },
        },
      ),
      NotificationSettings.updateOne(
        { user_id: user._id },
        {
          $set: {
            expo_push_tokens: [],
          },
        },
      ),
      User.updateMany(
        { ride_history: { $in: rideIdsToDelete } },
        { $pull: { ride_history: { $in: rideIdsToDelete } } },
      ),
    ]);

    if (driverProfile) {
      await Driver.updateOne(
        { _id: driverProfile._id },
        {
          $set: {
            status: "inactive",
            is_online: false,
            heading: 0,
            last_online_at: null,
            rating: 5,
            total_ratings: 0,
          },
          $unset: {
            current_location: "",
            last_known_location: "",
          },
        },
      );
    }

    const summary = {
      user: user.email,
      role: user.role,
      has_driver_profile: Boolean(driverProfile),
      rides_deleted: deletedRides.deletedCount || 0,
      bookings_deleted: deletedBookings.deletedCount || 0,
      notifications_deleted: deletedNotifications.deletedCount || 0,
      reviews_deleted: deletedReviews.deletedCount || 0,
      booked_ride_refs_removed: bookedRideIds.length,
      owned_ride_refs_removed: rideIdsToDelete.length,
    };

    if (jsonOutput) {
      emitJson({
        success: true,
        dry_run: false,
        command,
        summary,
      });
    } else {
      console.log("✅ Account data cleared successfully");
      console.table(summary);
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  const jsonOutput = process.argv.includes("--json");
  if (jsonOutput) {
    console.log(
      JSON.stringify({
        success: false,
        message: error.message || "Failed to clear account data",
      }),
    );
  } else {
    console.error("❌ Failed to clear account data:", error.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }
  }
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
