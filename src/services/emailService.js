const fs = require("fs").promises;
const path = require("path");
const { sendEmail } = require("../config/brevo");
const PlatformSettings = require("../models/PlatformSettings");

const DEFAULT_SUPPORT_EMAIL = "support@uniride.ng";
const DEFAULT_SUPPORT_PHONE = "+234 (0) 800-UNIRIDE";
const SUPPORT_CACHE_TTL_MS = 60 * 1000;

let supportContactCache = {
  expiresAt: 0,
  value: {
    supportEmail: DEFAULT_SUPPORT_EMAIL,
    supportPhone: DEFAULT_SUPPORT_PHONE,
  },
};

/**
 * Replace template variables with actual values
 * @param {String} template HTML template
 * @param {Object} variables Key-value pairs for replacement
 * @returns {String} Processed HTML
 */
const processTemplate = (template, variables) => {
  let processed = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    processed = processed.replace(regex, value || "");
  }

  // Handle conditional blocks (simple implementation)
  // Remove {{#if condition}}...{{/if}} blocks if condition is false
  processed = processed.replace(
    /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g,
    (match, condition, content) => {
      return variables[condition] ? content : "";
    },
  );

  return processed;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const normalizePhoneForTel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hasPlusPrefix = raw.startsWith("+");
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  return `${hasPlusPrefix ? "+" : ""}${digitsOnly}`;
};

const getSupportContactConfig = async () => {
  const now = Date.now();
  if (supportContactCache.expiresAt > now) {
    return supportContactCache.value;
  }

  try {
    const settings = await PlatformSettings.getSettings();
    const supportEmail =
      String(settings?.support_email || DEFAULT_SUPPORT_EMAIL).trim() ||
      DEFAULT_SUPPORT_EMAIL;
    const supportPhone =
      String(settings?.support_phone || DEFAULT_SUPPORT_PHONE).trim() ||
      DEFAULT_SUPPORT_PHONE;

    supportContactCache = {
      expiresAt: now + SUPPORT_CACHE_TTL_MS,
      value: { supportEmail, supportPhone },
    };
  } catch (error) {
    supportContactCache = {
      expiresAt: now + SUPPORT_CACHE_TTL_MS,
      value: {
        supportEmail: DEFAULT_SUPPORT_EMAIL,
        supportPhone: DEFAULT_SUPPORT_PHONE,
      },
    };
  }

  return supportContactCache.value;
};

const injectSupportFooter = async (htmlContent) => {
  const { supportEmail, supportPhone } = await getSupportContactConfig();
  const safeEmail = escapeHtml(supportEmail);
  const safePhone = escapeHtml(supportPhone);
  const telPhone = normalizePhoneForTel(supportPhone);

  const footerBlock = `
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5eaee;font-size:12px;line-height:1.6;color:#5b6872;">
      Need help? Reach us at <a href="mailto:${safeEmail}" style="color:#042F40;text-decoration:none;">${safeEmail}</a>
      ${telPhone ? ` or <a href="tel:${telPhone}" style="color:#042F40;text-decoration:none;">${safePhone}</a>` : ""}.
    </div>
  `;

  if (typeof htmlContent !== "string") {
    return footerBlock;
  }

  if (/<\/body>/i.test(htmlContent)) {
    return htmlContent.replace(/<\/body>/i, `${footerBlock}</body>`);
  }

  return `${htmlContent}${footerBlock}`;
};

const sendEmailWithSupport = async (payload) => {
  const htmlContent = await injectSupportFooter(payload.htmlContent || "");
  return sendEmail({
    ...payload,
    htmlContent,
  });
};

/**
 * Send email verification code
 */
const sendEmailVerificationCode = async (userData) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../emails/emailVerification.html",
    );
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: userData.name,
      verificationCode: userData.verificationCode,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: userData.email,
      subject: "Verify Your Email - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending email verification code:", error.message);
    throw error;
  }
};

/**
 * Send password reset code
 */
const sendPasswordResetCode = async (userData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/passwordReset.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: userData.name,
      resetCode: userData.resetCode,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: userData.email,
      subject: "Password Reset Request - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending password reset code:", error.message);
    throw error;
  }
};

/**
 * Send driver application received email
 */
const sendDriverApplicationReceivedEmail = async (driverData) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../emails/driverApplicationReceived.html",
    );
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: driverData.name,
      applicationId: driverData.applicationId,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: driverData.email,
      subject: "Driver Application Received - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error(
      "Error sending driver application received email:",
      error.message,
    );
    throw error;
  }
};

/**
 * Send driver approval email
 */
const sendDriverApprovalEmail = async (driverData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/driverApproval.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      driverName: driverData.name,
      email: driverData.email,
      temporaryPassword: driverData.temporaryPassword,
      isNewAccount: driverData.isNewAccount,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: driverData.email,
      subject: "Driver Application Approved - Welcome to UniRide!",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending driver approval email:", error.message);
    throw error;
  }
};

/**
 * Send driver rejection email
 */
const sendDriverRejectionEmail = async (driverData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/driverRejection.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      driverName: driverData.name,
      rejectionReason: driverData.rejectionReason,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: driverData.email,
      subject: "Driver Application Status Update - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending driver rejection email:", error.message);
    throw error;
  }
};

/**
 * Send ride confirmation email
 */
const sendRideConfirmationEmail = async (bookingData) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../emails/rideConfirmation.html",
    );
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: bookingData.userName,
      driverName: bookingData.driverName,
      vehicleModel: bookingData.vehicleModel,
      plateNumber: bookingData.plateNumber,
      driverRating: bookingData.driverRating,
      pickupLocation: bookingData.pickupLocation,
      destination: bookingData.destination,
      departureTime: bookingData.departureTime,
      fare: bookingData.fare,
      paymentMethod: bookingData.paymentMethod,
      checkInCode: bookingData.checkInCode,
      bankDetails: bookingData.bankDetails,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: bookingData.userEmail,
      subject: "Ride Booking Confirmation - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending ride confirmation email:", error.message);
    throw error;
  }
};

/**
 * Send ride completion email
 */
const sendRideCompletionEmail = async (rideData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/rideCompletion.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: rideData.userName,
      driverName: rideData.driverName,
      vehicleModel: rideData.vehicleModel,
      plateNumber: rideData.plateNumber,
      pickupLocation: rideData.pickupLocation,
      destination: rideData.destination,
      distance: rideData.distance,
      duration: rideData.duration,
      dateTime: rideData.dateTime,
      fare: rideData.fare,
      paymentMethod: rideData.paymentMethod,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: rideData.userEmail,
      subject: "Ride Completed - Thank You for Riding with UniRide!",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending ride completion email:", error.message);
    throw error;
  }
};

/**
 * Send missed ride email
 */
const sendMissedRideEmail = async (rideData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/missedRide.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      userName: rideData.userName,
      pickupLocation: rideData.pickupLocation,
      destination: rideData.destination,
      scheduledTime: rideData.scheduledTime,
      fare: rideData.fare,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: rideData.userEmail,
      subject: "Missed Ride Notification - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending missed ride email:", error.message);
    throw error;
  }
};

/**
 * Send admin invitation email
 */
const sendAdminInvitationEmail = async (adminData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/adminInvitation.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const htmlContent = processTemplate(template, {
      adminName: adminData.name,
      adminEmail: adminData.email,
      adminRole: adminData.role === "super_admin" ? "Super Admin" : "Admin",
      createdBy: adminData.createdBy,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: adminData.email,
      subject: "Welcome to UniRide Admin Team - Admin Invitation",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending admin invitation email:", error.message);
    throw error;
  }
};

/**
 * Send broadcast message email
 */
const sendBroadcastEmail = async (userData) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../emails/broadcastMessage.html",
    );
    const template = await fs.readFile(templatePath, "utf-8");

    // Determine badge text based on target audience
    let badgeText = "Announcement";
    if (userData.targetAudience === "all") badgeText = "General Announcement";
    else if (userData.targetAudience === "users") badgeText = "For Users";
    else if (userData.targetAudience === "drivers") badgeText = "For Drivers";
    else if (userData.targetAudience === "admins") badgeText = "For Admins";

    const htmlContent = processTemplate(template, {
      recipientName: userData.name || "UniRide User",
      recipientRole: userData.role || "user",
      title: userData.title,
      message: userData.message,
      senderName: userData.senderName || "UniRide Admin",
      sentDate: new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      badgeText: badgeText,
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: userData.email,
      subject: `📢 ${userData.title} - UniRide`,
      htmlContent,
    });

    console.log(`✅ Broadcast email sent to: ${userData.email}`);
  } catch (error) {
    console.error("Error sending broadcast email:", error.message);
    throw error;
  }
};

/**
 * Send PIN reset code email
 */
const sendPinResetCode = async (userData) => {
  try {
    const templatePath = path.join(__dirname, "../emails/pinReset.html");
    const template = await fs.readFile(templatePath, "utf-8");

    const code = String(userData.code);
    const htmlContent = processTemplate(template, {
      userName: userData.name,
      digit1: code[0] || "0",
      digit2: code[1] || "0",
      digit3: code[2] || "0",
      digit4: code[3] || "0",
      digit5: code[4] || "0",
      digit6: code[5] || "0",
      currentYear: new Date().getFullYear(),
    });

    await sendEmailWithSupport({
      to: userData.email,
      subject: userData.subject || "Reset Your PIN - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending PIN reset code:", error.message);
    throw error;
  }
};

const sendAccountDeletionEmail = async ({
  type,
  email,
  name,
  code,
  intent,
  scheduledFor,
  note,
}) => {
  const { supportEmail } = await getSupportContactConfig();
  const safeSupportEmail = escapeHtml(supportEmail || DEFAULT_SUPPORT_EMAIL);

  const titleMap = {
    code:
      intent === "cancel"
        ? "Verify Account Deletion Cancellation - UniRide"
        : "Verify Account Deletion Request - UniRide",
    requested: "Account Deletion Request Received - UniRide",
    approved: "Account Deletion Scheduled - UniRide",
    rejected: "Account Deletion Request Update - UniRide",
    cancelled: "Account Deletion Cancelled - UniRide",
  };

  const bodyMap = {
    code: `<p>Use the verification code below to ${
      intent === "cancel"
        ? "cancel your account deletion request"
        : "request account deletion"
    }.</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">${code}</p><p>This code expires in 15 minutes.</p>`,
    requested:
      "<p>We received your UniRide account deletion request. An administrator will review it before deletion is scheduled.</p><p>You will receive another update after the request is reviewed.</p>",
    approved: `<p>Your UniRide account deletion request was approved.</p><p>Your account is scheduled for permanent deletion on <strong>${new Date(
      scheduledFor,
    ).toLocaleString()}</strong>.</p><p>You can still cancel this request before that date.</p>`,
    rejected: `<p>Your UniRide account deletion request was rejected.</p>${
      note ? `<p><strong>Reason:</strong> ${note}</p>` : ""
    }<p>If you need help, contact privacy@uniride.ng or ${safeSupportEmail}.</p>`,
    cancelled:
      "<p>Your UniRide account deletion request has been cancelled successfully. Your account will remain active.</p>",
  };

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;background:#f5f7f9;padding:32px;color:#10212b;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d7dee4;">
        <div style="background:#042F40;padding:24px 28px;color:#ffffff;">
          <div style="font-size:20px;font-weight:700;">UniRide</div>
          <div style="margin-top:6px;font-size:13px;opacity:0.8;">Account deletion support</div>
        </div>
        <div style="padding:28px;">
          <p>Hello ${name || "UniRide user"},</p>
          ${bodyMap[type]}
          <hr style="border:none;border-top:1px solid #e5eaee;margin:24px 0;" />
          <p style="font-size:13px;color:#55636d;">
            If you did not initiate this action, please contact privacy@uniride.ng or ${safeSupportEmail} immediately.
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmailWithSupport({
    to: email,
    subject: titleMap[type],
    htmlContent,
  });
};

module.exports = {
  sendEmailVerificationCode,
  sendPasswordResetCode,
  sendPinResetCode,
  sendDriverApplicationReceivedEmail,
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendRideConfirmationEmail,
  sendRideCompletionEmail,
  sendMissedRideEmail,
  sendAdminInvitationEmail,
  sendBroadcastEmail,
  sendAccountDeletionEmail,
};
