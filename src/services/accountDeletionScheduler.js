const AccountDeletionRequest = require("../models/AccountDeletionRequest");
const User = require("../models/User");
const { purgeUserAccount } = require("./accountDeletionService");

const INTERVAL_MS = 60 * 1000;
let intervalId = null;

const processDueDeletionRequests = async () => {
  const dueRequests = await AccountDeletionRequest.find({
    status: "scheduled",
    scheduled_for: { $lte: new Date() },
  }).sort({ scheduled_for: 1 });

  for (const request of dueRequests) {
    try {
      const user = await User.findById(request.user_id);
      if (!user) {
        request.status = "completed";
        request.completed_at = new Date();
        request.completion_summary = {
          ...(request.completion_summary || {}),
          note: "User record was already removed before scheduler ran",
        };
        await request.save();
        continue;
      }

      await purgeUserAccount({
        user,
        deletedBy: null,
        preserveRequestId: request._id,
      });
    } catch (error) {
      console.error(
        `Account deletion scheduler failed for request ${request._id}:`,
        error.message,
      );
    }
  }
};

const startAccountDeletionScheduler = () => {
  if (intervalId) {
    return;
  }

  console.log("⏰ Account deletion scheduler started (checks every 60s)");
  processDueDeletionRequests().catch((error) => {
    console.error("Initial account deletion scheduler run failed:", error);
  });
  intervalId = setInterval(() => {
    processDueDeletionRequests().catch((error) => {
      console.error("Account deletion scheduler tick failed:", error);
    });
  }, INTERVAL_MS);
};

module.exports = { startAccountDeletionScheduler };
