const fs = require("fs").promises;
const path = require("path");
const { sendEmail } = require("../config/brevo");

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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
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

    await sendEmail({
      to: userData.email,
      subject: userData.subject || "Reset Your PIN - UniRide",
      htmlContent,
    });
  } catch (error) {
    console.error("Error sending PIN reset code:", error.message);
    throw error;
  }
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
};
