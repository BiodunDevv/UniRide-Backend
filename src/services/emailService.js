const fs = require("fs").promises;
const path = require("path");
const brevoConfig = require("../config/brevo");
const logger = require("../config/logger");

/**
 * Send transactional email via Brevo
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.toName - Recipient name
 * @param {string} options.subject - Email subject
 * @param {string} options.htmlContent - HTML content
 * @param {string} options.textContent - Plain text content (optional)
 * @returns {Promise<object>}
 */
const sendEmail = async (options) => {
  try {
    const { to, toName, subject, htmlContent, textContent } = options;

    const emailData = {
      sender: {
        email: brevoConfig.senderEmail,
        name: brevoConfig.senderName,
      },
      to: [
        {
          email: to,
          name: toName || to,
        },
      ],
      subject,
      htmlContent,
      ...(textContent && { textContent }),
    };

    const response = await brevoConfig.client.post(
      brevoConfig.endpoints.sendTransactionalEmail,
      emailData
    );

    logger.info(`Email sent to ${to}: ${subject}`);
    return {
      success: true,
      messageId: response.data.messageId,
    };
  } catch (error) {
    logger.error(`Email send error: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Load email template from file
 * @param {string} templateName - Template filename (without extension)
 * @param {object} variables - Variables to replace in template
 * @returns {Promise<string>}
 */
const loadEmailTemplate = async (templateName, variables = {}) => {
  try {
    const templatePath = path.join(
      __dirname,
      "..",
      "email_templates",
      `${templateName}.html`
    );
    let template = await fs.readFile(templatePath, "utf-8");

    // Replace variables in template
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      template = template.replace(regex, variables[key]);
    });

    return template;
  } catch (error) {
    logger.error(
      `Error loading email template ${templateName}: ${error.message}`
    );
    throw error;
  }
};

/**
 * Send driver application received email
 */
const sendDriverApplicationReceivedEmail = async (driverEmail, driverName) => {
  try {
    const htmlContent = await loadEmailTemplate("driver_application_received", {
      driver_name: driverName,
    });

    return await sendEmail({
      to: driverEmail,
      toName: driverName,
      subject: "UniRide - Application Received",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending application received email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send driver approval email with credentials
 */
const sendDriverApprovalEmail = async (driverEmail, driverName, password) => {
  try {
    const htmlContent = await loadEmailTemplate("driver_approval", {
      driver_name: driverName,
      email: driverEmail,
      password: password,
    });

    return await sendEmail({
      to: driverEmail,
      toName: driverName,
      subject: "UniRide - Application Approved! Welcome Aboard",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending driver approval email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send driver rejection email
 */
const sendDriverRejectionEmail = async (driverEmail, driverName, reason) => {
  try {
    const htmlContent = await loadEmailTemplate("driver_rejection", {
      driver_name: driverName,
      rejection_reason: reason || "Please contact support for more details.",
    });

    return await sendEmail({
      to: driverEmail,
      toName: driverName,
      subject: "UniRide - Application Update",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending driver rejection email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send booking confirmation email to student
 */
const sendBookingConfirmationEmail = async (
  studentEmail,
  studentName,
  rideDetails
) => {
  try {
    const htmlContent = await loadEmailTemplate("booking_confirmation", {
      student_name: studentName,
      driver_name: rideDetails.driverName,
      pickup_address: rideDetails.pickupAddress,
      destination_address: rideDetails.destinationAddress,
      departure_time: rideDetails.departureTime,
      fare: rideDetails.fare,
      seats: rideDetails.seats,
    });

    return await sendEmail({
      to: studentEmail,
      toName: studentName,
      subject: "UniRide - Booking Confirmed",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending booking confirmation email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send ride completion email
 */
const sendRideCompletionEmail = async (email, name, rideDetails) => {
  try {
    const htmlContent = await loadEmailTemplate("ride_completion", {
      name: name,
      driver_name: rideDetails.driverName || "Your driver",
      pickup_address: rideDetails.pickupAddress,
      destination_address: rideDetails.destinationAddress,
      fare: rideDetails.fare,
      distance: rideDetails.distance,
      rating_link: rideDetails.ratingLink || "#",
    });

    return await sendEmail({
      to: email,
      toName: name,
      subject: "UniRide - Ride Completed",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending ride completion email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send missed ride alert email
 */
const sendMissedRideAlertEmail = async (
  studentEmail,
  studentName,
  rideDetails
) => {
  try {
    const htmlContent = await loadEmailTemplate("missed_ride_alert", {
      student_name: studentName,
      pickup_address: rideDetails.pickupAddress,
      departure_time: rideDetails.departureTime,
    });

    return await sendEmail({
      to: studentEmail,
      toName: studentName,
      subject: "UniRide - Missed Ride Alert",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending missed ride alert email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send password change confirmation email
 */
const sendPasswordChangeEmail = async (email, name) => {
  try {
    const htmlContent = await loadEmailTemplate(
      "password_change_confirmation",
      {
        name: name,
      }
    );

    return await sendEmail({
      to: email,
      toName: name,
      subject: "UniRide - Password Changed Successfully",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending password change email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send password reset email with 6-digit code
 */
const sendPasswordResetEmail = async (
  userEmail,
  userName,
  resetCode,
  userType
) => {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .code-box { background-color: #fff; border: 2px dashed #4CAF50; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
          .code { font-size: 32px; font-weight: bold; color: #4CAF50; letter-spacing: 5px; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .warning { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 UniRide</h1>
            <p>Password Reset Request</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>We received a request to reset your password for your ${userType} account.</p>
            <p>Use the 6-digit code below to reset your password:</p>
            <div class="code-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your Reset Code</p>
              <div class="code">${resetCode}</div>
            </div>
            <div class="warning">
              <strong>⚠️ Important:</strong>
              <ul>
                <li>This code will expire in 1 hour</li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you use this code to create a new one</li>
                <li>Do not share this code with anyone</li>
              </ul>
            </div>
            <p>If you're having trouble, contact support at louisdiaz43@gmail.com</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} UniRide. All rights reserved.</p>
            <p>Secure Campus Transportation</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await sendEmail({
      to: userEmail,
      toName: userName,
      subject: "UniRide - Password Reset Code",
      htmlContent,
    });
  } catch (error) {
    logger.error(`Error sending password reset email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  loadEmailTemplate,
  sendDriverApplicationReceivedEmail,
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendBookingConfirmationEmail,
  sendRideCompletionEmail,
  sendMissedRideAlertEmail,
  sendPasswordChangeEmail,
  sendPasswordResetEmail,
};
