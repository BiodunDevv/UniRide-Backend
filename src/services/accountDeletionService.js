const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const AdminNotification = require("../models/AdminNotification");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const SupportTicket = require("../models/SupportTicket");
const NotificationSettings = require("../models/NotificationSettings");
const UserNotification = require("../models/UserNotification");
const AccountDeletionRequest = require("../models/AccountDeletionRequest");
const { createAndPush } = require("./notificationService");

const ACTIVE_REQUEST_STATUSES = ["pending_review", "scheduled"];
const USER_DELETION_STATUS = {
  NONE: "none",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
};

const normalizeDeletionState = (user, overrides = {}) => {
  user.account_deletion_status =
    overrides.status ?? USER_DELETION_STATUS.NONE;
  user.account_deletion_requested_at = overrides.requested_at ?? null;
  user.account_deletion_requested_via = overrides.requested_via ?? null;
  user.account_deletion_reason = overrides.reason ?? "";
  user.account_deletion_reviewed_at = overrides.reviewed_at ?? null;
  user.account_deletion_reviewed_by = overrides.reviewed_by ?? null;
  user.account_deletion_review_note = overrides.review_note ?? "";
  user.account_deletion_scheduled_for = overrides.scheduled_for ?? null;
  user.account_deletion_cancelled_at = overrides.cancelled_at ?? null;
  user.account_deletion_completed_at = overrides.completed_at ?? null;
  return user;
};

const resetDeletionState = (user) =>
  normalizeDeletionState(user, {
    status: USER_DELETION_STATUS.NONE,
  });

const buildNotificationCopy = (status, scheduledFor, note = "") => {
  if (status === USER_DELETION_STATUS.PENDING_REVIEW) {
    return {
      title: "Account Deletion Requested",
      message:
        "We received your account deletion request. An administrator will review it before any deletion is scheduled.",
    };
  }

  if (status === USER_DELETION_STATUS.SCHEDULED) {
    return {
      title: "Account Deletion Approved",
      message: `Your UniRide account is scheduled for deletion on ${new Date(scheduledFor).toLocaleString()}. You can cancel before that date if you change your mind.`,
    };
  }

  if (status === USER_DELETION_STATUS.REJECTED) {
    return {
      title: "Account Deletion Request Rejected",
      message: note
        ? `Your deletion request was rejected. Reason: ${note}`
        : "Your deletion request was rejected. Please contact support if you need help.",
    };
  }

  return {
    title: "Account Deletion Cancelled",
    message:
      "Your UniRide account deletion request has been cancelled. Your account will remain active.",
  };
};

const notifyUserOfDeletionState = async (userId, status, scheduledFor, note) => {
  const copy = buildNotificationCopy(status, scheduledFor, note);
  await createAndPush(userId, copy.title, copy.message, "account", {
    action: "account_deletion_status_changed",
    account_deletion_status: status,
    scheduled_for: scheduledFor || null,
  });
};

const getActiveDeletionRequestForUser = async (userId) =>
  AccountDeletionRequest.findOne({
    user_id: userId,
    status: { $in: ACTIVE_REQUEST_STATUSES },
  }).sort({ createdAt: -1 });

const createDeletionRequest = async ({
  user,
  requestedVia,
  reason = "",
  actor = null,
}) => {
  const existing = await getActiveDeletionRequestForUser(user._id);
  if (existing) {
    const error = new Error("An active account deletion request already exists");
    error.statusCode = 409;
    throw error;
  }

  const request = await AccountDeletionRequest.create({
    user_id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    requested_via: requestedVia,
    request_reason: (reason || "").trim(),
    status: "pending_review",
  });

  normalizeDeletionState(user, {
    status: USER_DELETION_STATUS.PENDING_REVIEW,
    requested_at: request.createdAt,
    requested_via: requestedVia,
    reason: request.request_reason,
  });
  await user.save();

  try {
    await notifyUserOfDeletionState(
      user._id,
      USER_DELETION_STATUS.PENDING_REVIEW,
      null,
      null,
    );
  } catch (error) {
    console.error("Failed to notify user of deletion request:", error.message);
  }

  try {
    await AdminNotification.create({
      type: "system_alert",
      title: "Account Deletion Requested",
      message: `${user.name} (${user.email}) requested account deletion via ${requestedVia}`,
      reference_id: user._id,
      reference_model: "User",
      priority: "high",
      metadata: {
        action: "account_deletion_requested",
        user_name: user.name,
        user_email: user.email,
        user_role: user.role,
        requested_via: requestedVia,
        requested_by_id: actor?._id || user._id,
      },
    });
  } catch (error) {
    console.error(
      "Failed to create admin notification for deletion request:",
      error.message,
    );
  }

  return request;
};

const cancelDeletionRequest = async ({ user, actor = null }) => {
  const request = await getActiveDeletionRequestForUser(user._id);
  if (!request) {
    const error = new Error("No active account deletion request found");
    error.statusCode = 404;
    throw error;
  }

  request.status = "cancelled";
  request.cancelled_at = new Date();
  request.reviewed_by = actor?._id || null;
  request.reviewed_at = new Date();
  await request.save();

  normalizeDeletionState(user, {
    status: USER_DELETION_STATUS.CANCELLED,
    requested_at: request.createdAt,
    requested_via: request.requested_via,
    reason: request.request_reason,
    reviewed_at: request.reviewed_at,
    reviewed_by: request.reviewed_by,
    cancelled_at: request.cancelled_at,
  });
  await user.save();
  resetDeletionState(user);
  await user.save();

  try {
    await notifyUserOfDeletionState(
      user._id,
      USER_DELETION_STATUS.CANCELLED,
      null,
      null,
    );
  } catch (error) {
    console.error("Failed to notify user of cancellation:", error.message);
  }

  return request;
};

const approveDeletionRequest = async ({ request, adminUser }) => {
  const user = await User.findById(request.user_id);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  request.status = "scheduled";
  request.reviewed_by = adminUser._id;
  request.reviewed_at = new Date();
  request.scheduled_for = scheduledFor;
  await request.save();

  normalizeDeletionState(user, {
    status: USER_DELETION_STATUS.SCHEDULED,
    requested_at: request.createdAt,
    requested_via: request.requested_via,
    reason: request.request_reason,
    reviewed_at: request.reviewed_at,
    reviewed_by: adminUser._id,
    scheduled_for: scheduledFor,
  });
  await user.save();

  try {
    await notifyUserOfDeletionState(
      user._id,
      USER_DELETION_STATUS.SCHEDULED,
      scheduledFor,
      null,
    );
  } catch (error) {
    console.error("Failed to notify user of approval:", error.message);
  }

  return { user, request };
};

const rejectDeletionRequest = async ({ request, adminUser, note }) => {
  const user = await User.findById(request.user_id);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  request.status = "rejected";
  request.reviewed_by = adminUser._id;
  request.reviewed_at = new Date();
  request.review_note = (note || "").trim();
  await request.save();

  normalizeDeletionState(user, {
    status: USER_DELETION_STATUS.REJECTED,
    requested_at: request.createdAt,
    requested_via: request.requested_via,
    reason: request.request_reason,
    reviewed_at: request.reviewed_at,
    reviewed_by: adminUser._id,
    review_note: request.review_note,
  });
  await user.save();

  try {
    await notifyUserOfDeletionState(
      user._id,
      USER_DELETION_STATUS.REJECTED,
      null,
      request.review_note,
    );
  } catch (error) {
    console.error("Failed to notify user of rejection:", error.message);
  }

  return { user, request };
};

const purgeUserAccount = async ({
  user,
  deletedBy = null,
  preserveRequestId = null,
}) => {
  const userId = user._id;
  const summary = {
    deleted_user_id: userId,
    deleted_user_email: user.email,
    deleted_user_role: user.role,
    deleted_at: new Date(),
    bookings_deleted: 0,
    tickets_deleted: 0,
    notifications_deleted: 0,
    driver_deleted: false,
    rides_deleted: 0,
    driver_applications_deleted: 0,
  };

  if (user.role === "driver") {
    const driver = await Driver.findOne({ user_id: userId });
    if (driver) {
      const rideIds = (
        await Ride.find({ driver_id: driver._id }).select("_id")
      ).map((ride) => ride._id);

      if (rideIds.length) {
        const bookingDeleteResult = await Booking.deleteMany({
          ride_id: { $in: rideIds },
        });
        summary.bookings_deleted += bookingDeleteResult.deletedCount;
      }

      const rideDeleteResult = await Ride.deleteMany({ driver_id: driver._id });
      summary.rides_deleted += rideDeleteResult.deletedCount;

      await Driver.deleteOne({ _id: driver._id });
      summary.driver_deleted = true;
    }
  }

  const bookingDeleteResult = await Booking.deleteMany({ user_id: userId });
  summary.bookings_deleted += bookingDeleteResult.deletedCount;

  const ticketDeleteResult = await SupportTicket.deleteMany({ user_id: userId });
  summary.tickets_deleted += ticketDeleteResult.deletedCount;

  await SupportTicket.updateMany(
    { assigned_to: userId },
    { $set: { assigned_to: null, status: "open" } },
  );
  await SupportTicket.updateMany(
    { "messages.sender_id": userId },
    { $pull: { messages: { sender_id: userId } } },
  );

  const userNotificationDeleteResult = await UserNotification.deleteMany({
    user_id: userId,
  });
  summary.notifications_deleted += userNotificationDeleteResult.deletedCount;

  await NotificationSettings.deleteMany({ user_id: userId });
  await AdminNotification.deleteMany({
    reference_id: userId,
    reference_model: "User",
  });

  const applicationDeleteResult = await DriverApplication.deleteMany({
    $or: [{ user_id: userId }, { email: user.email }],
  });
  summary.driver_applications_deleted = applicationDeleteResult.deletedCount;

  await User.deleteOne({ _id: userId });

  if (preserveRequestId) {
    await AccountDeletionRequest.findByIdAndUpdate(preserveRequestId, {
      status: "completed",
      completed_at: new Date(),
      completion_summary: {
        ...summary,
        completed_by_id: deletedBy?._id || null,
        completed_by_name: deletedBy?.name || "Account Deletion Scheduler",
      },
    });
  }

  return summary;
};

module.exports = {
  USER_DELETION_STATUS,
  ACTIVE_REQUEST_STATUSES,
  resetDeletionState,
  normalizeDeletionState,
  getActiveDeletionRequestForUser,
  createDeletionRequest,
  cancelDeletionRequest,
  approveDeletionRequest,
  rejectDeletionRequest,
  purgeUserAccount,
};
