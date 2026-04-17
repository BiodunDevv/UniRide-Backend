const crypto = require("crypto");
const User = require("../models/User");
const Driver = require("../models/Driver");
const AccountDeletionRequest = require("../models/AccountDeletionRequest");
const AccountDeletionVerification = require("../models/AccountDeletionVerification");
const generateVerificationCode = require("../utils/generateVerificationCode");
const {
  sendAccountDeletionEmail,
} = require("../services/emailService");
const {
  createDeletionRequest,
  cancelDeletionRequest,
  getActiveDeletionRequestForUser,
  approveDeletionRequest,
  rejectDeletionRequest,
} = require("../services/accountDeletionService");

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const serializeRequest = (requestDoc) => ({
  id: requestDoc._id,
  user_id: requestDoc.user_id,
  email: requestDoc.email,
  name: requestDoc.name,
  role: requestDoc.role,
  status: requestDoc.status,
  requested_via: requestDoc.requested_via,
  request_reason: requestDoc.request_reason,
  reviewed_by: requestDoc.reviewed_by,
  reviewed_at: requestDoc.reviewed_at,
  review_note: requestDoc.review_note,
  scheduled_for: requestDoc.scheduled_for,
  cancelled_at: requestDoc.cancelled_at,
  completed_at: requestDoc.completed_at,
  completion_summary: requestDoc.completion_summary,
  createdAt: requestDoc.createdAt,
  updatedAt: requestDoc.updatedAt,
});

const buildStatusPayload = async (user) => {
  const request =
    (await AccountDeletionRequest.findOne({ user_id: user._id }).sort({
      createdAt: -1,
    })) || null;
  return {
    account_deletion_status: user.account_deletion_status || "none",
    account_deletion_requested_at: user.account_deletion_requested_at || null,
    account_deletion_scheduled_for: user.account_deletion_scheduled_for || null,
    account_deletion_review_note: user.account_deletion_review_note || "",
    account_deletion_request: request ? serializeRequest(request) : null,
  };
};

const findEligibleUserByEmail = async (email) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user || !["user", "driver"].includes(user.role)) {
    return null;
  }
  return user;
};

const requestDeletionCode = async (req, res, next) => {
  try {
    const { email, intent } = req.body;

    if (!email || !["request", "cancel"].includes(intent)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email and intent",
      });
    }

    const user = await findEligibleUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No UniRide rider or driver account was found for that email",
      });
    }

    if (intent === "cancel") {
      const activeRequest = await getActiveDeletionRequestForUser(user._id);
      if (!activeRequest) {
        return res.status(400).json({
          success: false,
          message: "There is no active deletion request to cancel",
        });
      }
    }

    if (intent === "request") {
      const activeRequest = await getActiveDeletionRequestForUser(user._id);
      if (activeRequest) {
        return res.status(409).json({
          success: false,
          message: "An active account deletion request already exists",
        });
      }
    }

    const code = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await AccountDeletionVerification.deleteMany({
      email: user.email,
      intent,
    });

    await AccountDeletionVerification.create({
      email: user.email,
      user_id: user._id,
      intent,
      code,
      code_expires_at: codeExpiresAt,
    });

    try {
      await sendAccountDeletionEmail({
        type: "code",
        email: user.email,
        name: user.name,
        intent,
        code,
      });
    } catch (error) {
      console.error("Failed to send account deletion code:", error.message);
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent",
    });
  } catch (error) {
    next(error);
  }
};

const verifyDeletionCode = async (req, res, next) => {
  try {
    const { email, code, intent } = req.body;

    const verification = await AccountDeletionVerification.findOne({
      email: normalizeEmail(email),
      intent,
    })
      .select("+code +verification_token")
      .sort({ createdAt: -1 });

    if (!verification) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found. Please request a new code.",
      });
    }

    if (verification.code_expires_at < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Verification code expired. Please request a new one.",
      });
    }

    if (verification.code !== String(code || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    verification.verified_at = new Date();
    verification.verification_token = crypto.randomBytes(24).toString("hex");
    verification.token_expires_at = new Date(Date.now() + 20 * 60 * 1000);
    await verification.save();

    res.status(200).json({
      success: true,
      message: "Code verified",
      data: {
        verification_token: verification.verification_token,
      },
    });
  } catch (error) {
    next(error);
  }
};

const resolveVerifiedUser = async (email, intent, verificationToken) => {
  const verification = await AccountDeletionVerification.findOne({
    email: normalizeEmail(email),
    intent,
  })
    .select("+verification_token")
    .sort({ createdAt: -1 });

  if (!verification || !verification.verification_token) {
    const error = new Error("Verification required");
    error.statusCode = 400;
    throw error;
  }

  if (verification.token_expires_at < new Date()) {
    const error = new Error("Verification expired");
    error.statusCode = 400;
    throw error;
  }

  if (verification.verification_token !== verificationToken) {
    const error = new Error("Invalid verification token");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(verification.user_id);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  await AccountDeletionVerification.deleteMany({
    email: verification.email,
    intent,
  });

  return user;
};

const submitPublicDeletionRequest = async (req, res, next) => {
  try {
    const { email, verification_token, reason } = req.body;
    const user = await resolveVerifiedUser(email, "request", verification_token);
    const request = await createDeletionRequest({
      user,
      requestedVia: "web_public",
      reason,
    });

    try {
      await sendAccountDeletionEmail({
        type: "requested",
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      console.error("Failed to send request email:", error.message);
    }

    res.status(201).json({
      success: true,
      message: "Account deletion request submitted",
      data: serializeRequest(request),
    });
  } catch (error) {
    next(error);
  }
};

const cancelPublicDeletionRequest = async (req, res, next) => {
  try {
    const { email, verification_token } = req.body;
    const user = await resolveVerifiedUser(email, "cancel", verification_token);
    const request = await cancelDeletionRequest({ user });

    try {
      await sendAccountDeletionEmail({
        type: "cancelled",
        email: user.email,
        name: user.name,
      });
    } catch (error) {
      console.error("Failed to send cancellation email:", error.message);
    }

    res.status(200).json({
      success: true,
      message: "Account deletion request cancelled",
      data: serializeRequest(request),
    });
  } catch (error) {
    next(error);
  }
};

const getAuthenticatedDeletionStatus = async (req, res, next) => {
  try {
    const payload = await buildStatusPayload(req.user);
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    next(error);
  }
};

const submitAuthenticatedDeletionRequest = async (req, res, next) => {
  try {
    const request = await createDeletionRequest({
      user: req.user,
      requestedVia: req.body.requested_via || "mobile",
      reason: req.body.reason,
      actor: req.user,
    });

    try {
      await sendAccountDeletionEmail({
        type: "requested",
        email: req.user.email,
        name: req.user.name,
      });
    } catch (error) {
      console.error("Failed to send request email:", error.message);
    }

    res.status(201).json({
      success: true,
      message: "Account deletion request submitted",
      data: serializeRequest(request),
    });
  } catch (error) {
    next(error);
  }
};

const cancelAuthenticatedDeletionRequest = async (req, res, next) => {
  try {
    const request = await cancelDeletionRequest({
      user: req.user,
      actor: req.user,
    });

    try {
      await sendAccountDeletionEmail({
        type: "cancelled",
        email: req.user.email,
        name: req.user.name,
      });
    } catch (error) {
      console.error("Failed to send cancellation email:", error.message);
    }

    res.status(200).json({
      success: true,
      message: "Account deletion request cancelled",
      data: serializeRequest(request),
    });
  } catch (error) {
    next(error);
  }
};

const listDeletionRequests = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const requests = await AccountDeletionRequest.find(filter)
      .populate("reviewed_by", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: requests.map(serializeRequest),
    });
  } catch (error) {
    next(error);
  }
};

const getDeletionRequestById = async (req, res, next) => {
  try {
    const request = await AccountDeletionRequest.findById(req.params.id).populate(
      "reviewed_by",
      "name email role",
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Deletion request not found",
      });
    }

    const user = await User.findById(request.user_id);
    const driver =
      request.role === "driver" && user
        ? await Driver.findOne({ user_id: user._id })
        : null;

    res.status(200).json({
      success: true,
      data: {
        ...serializeRequest(request),
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              role: user.role,
              createdAt: user.createdAt,
              account_deletion_status: user.account_deletion_status,
            }
          : null,
        driver,
      },
    });
  } catch (error) {
    next(error);
  }
};

const approveDeletionRequestForAdmin = async (req, res, next) => {
  try {
    const request = await AccountDeletionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Deletion request not found",
      });
    }

    if (request.status !== "pending_review") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be approved",
      });
    }

    const result = await approveDeletionRequest({
      request,
      adminUser: req.user,
    });

    try {
      await sendAccountDeletionEmail({
        type: "approved",
        email: result.user.email,
        name: result.user.name,
        scheduledFor: result.request.scheduled_for,
      });
    } catch (error) {
      console.error("Failed to send approval email:", error.message);
    }

    res.status(200).json({
      success: true,
      message: "Account deletion request approved",
      data: serializeRequest(result.request),
    });
  } catch (error) {
    next(error);
  }
};

const rejectDeletionRequestForAdmin = async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!String(note || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "A rejection note is required",
      });
    }

    const request = await AccountDeletionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Deletion request not found",
      });
    }

    if (request.status !== "pending_review") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be rejected",
      });
    }

    const result = await rejectDeletionRequest({
      request,
      adminUser: req.user,
      note,
    });

    try {
      await sendAccountDeletionEmail({
        type: "rejected",
        email: result.user.email,
        name: result.user.name,
        note,
      });
    } catch (error) {
      console.error("Failed to send rejection email:", error.message);
    }

    res.status(200).json({
      success: true,
      message: "Account deletion request rejected",
      data: serializeRequest(result.request),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestDeletionCode,
  verifyDeletionCode,
  submitPublicDeletionRequest,
  cancelPublicDeletionRequest,
  getAuthenticatedDeletionStatus,
  submitAuthenticatedDeletionRequest,
  cancelAuthenticatedDeletionRequest,
  listDeletionRequests,
  getDeletionRequestById,
  approveDeletionRequestForAdmin,
  rejectDeletionRequestForAdmin,
};
