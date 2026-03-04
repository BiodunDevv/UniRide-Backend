const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Driver = require("../models/Driver");
const NotificationSettings = require("../models/NotificationSettings");
const UserNotification = require("../models/UserNotification");
const { v4: uuidv4 } = require("uuid");
const generateVerificationCode = require("../utils/generateVerificationCode");
const {
  sendEmailVerificationCode,
  sendPasswordResetCode,
  sendPinResetCode,
} = require("../services/emailService");
const { sendPushNotification } = require("../services/pushNotificationService");
const Language = require("../models/Language");
const { translateText } = require("../utils/translator");

/**
 * Helper: create in-app notification and optionally push
 */
const createSystemNotification = async (
  user_id,
  title,
  message,
  type = "system",
  metadata = {},
  sendPush = true,
) => {
  try {
    await UserNotification.create({ user_id, title, message, type, metadata });
    if (sendPush) {
      sendPushNotification({
        user_id,
        title,
        message,
        data: metadata,
        notificationType: type,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("Failed to create system notification:", err.message);
  }
};

/**
 * Generate JWT token
 */
const generateToken = (id, device_id) => {
  return jwt.sign({ id, device_id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (requires email verification)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user]
 *                 default: user
 *     responses:
 *       201:
 *         description: User registered successfully, verification code sent
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Only users can self-register; drivers must apply via the web portal
    const assignedRole = "user";

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: assignedRole,
      email_verified: false,
      email_verification_code: verificationCode,
      email_verification_expires: verificationExpires,
    });

    // Create notification settings with all notifications enabled by default
    await NotificationSettings.create({
      user_id: user._id,
      push_notifications_enabled: true,
      email_notifications_enabled: true,
      notification_preferences: {
        ride_requests: true,
        ride_accepted: true,
        ride_started: true,
        ride_completed: true,
        driver_nearby: true,
        payment_received: true,
        promotional_messages: true,
        broadcast_messages: true,
      },
    });

    // Send verification email
    try {
      await sendEmailVerificationCode({
        name: user.name,
        email: user.email,
        verificationCode,
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError.message);
      // Continue even if email fails
    }

    res.status(201).json({
      success: true,
      message:
        "User registered successfully. Please check your email for verification code.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - device_id
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               device_id:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [mobile, web]
 *                 description: The platform the user is logging in from
 *     responses:
 *       200:
 *         description: Login successful
 */
const login = async (req, res, next) => {
  try {
    const { email, password, device_id, platform } = req.body;

    // Validate input
    if (!email || !password || !device_id) {
      return res.status(400).json({
        success: false,
        message: "Please provide email, password, and device_id",
      });
    }

    // Check user exists and get password
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Platform-based role enforcement
    const userRole = user.role;
    const loginPlatform = platform || "web";

    if (
      loginPlatform === "web" &&
      userRole !== "admin" &&
      userRole !== "super_admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Only administrators can sign in to the web portal.",
        platform_restricted: true,
      });
    }

    if (
      loginPlatform === "mobile" &&
      (userRole === "admin" || userRole === "super_admin")
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin accounts must use the web portal.",
        platform_restricted: true,
      });
    }

    // Role mismatch enforcement (mobile only)
    // If the client sends a specific role, verify it matches the user's actual role
    const requestedRole = req.body.role;
    if (loginPlatform === "mobile" && requestedRole) {
      if (requestedRole !== userRole) {
        const roleLabel = requestedRole === "driver" ? "driver" : "rider";
        const actualLabel = userRole === "driver" ? "driver" : "rider";
        return res.status(403).json({
          success: false,
          message: `This account is registered as a ${actualLabel}. Please sign in with the ${actualLabel} option instead.`,
          role_mismatch: true,
          expected_role: userRole,
        });
      }
    }

    // Check if email is verified - auto-resend code if not
    if (!user.email_verified) {
      // Generate new verification code
      const verificationCode = generateVerificationCode();
      user.email_verification_code = verificationCode;
      user.email_verification_expires = Date.now() + 15 * 60 * 1000; // 15 minutes
      await user.save();

      // Send verification email
      await sendEmailVerificationCode({
        name: user.name,
        email: user.email,
        verificationCode,
      });

      return res.status(403).json({
        success: false,
        message:
          "Email not verified. A new verification code has been sent to your email.",
        email_verification_required: true,
      });
    }

    // Check if user is flagged
    if (user.is_flagged) {
      return res.status(403).json({
        success: false,
        message: "Your account has been flagged. Please contact support.",
        is_flagged: true,
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Multi-device support with restrictions
    const MAX_DEVICES_USER = 3;
    const isAdmin = user.role === "admin" || user.role === "super_admin";

    // Initialize devices array if not exists
    if (!user.devices) {
      user.devices = [];
    }

    // Check if device already exists
    const existingDeviceIndex = user.devices.findIndex(
      (d) => d.device_id === device_id,
    );

    if (existingDeviceIndex !== -1) {
      // Update existing device
      user.devices[existingDeviceIndex].last_login = new Date();
      user.devices[existingDeviceIndex].ip_address =
        req.ip || req.connection.remoteAddress;
      user.devices[existingDeviceIndex].user_agent = req.headers["user-agent"];
    } else {
      // New device - check device limit for non-admin users
      if (!isAdmin && user.devices.length >= MAX_DEVICES_USER) {
        return res.status(403).json({
          success: false,
          message: `This account is already logged in on ${MAX_DEVICES_USER} devices. Please logout from another device first.`,
          devices: user.devices.map((d) => ({
            device_id: d.device_id,
            device_name: d.device_name,
            device_type: d.device_type,
            last_login: d.last_login,
          })),
        });
      }

      // Add new device
      user.devices.push({
        device_id,
        device_name: req.body.device_name || "Unknown Device",
        device_type: req.body.device_type || "other",
        last_login: new Date(),
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers["user-agent"],
      });
    }

    await user.save();

    // Generate token with device_id
    const token = generateToken(user._id, device_id);

    // Create login notification
    createSystemNotification(
      user._id,
      "New Sign In",
      `You signed in from ${req.body.device_name || "a device"} at ${new Date().toLocaleString()}.`,
      "security",
      { action: "login", device_name: req.body.device_name || "Unknown" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          biometric_enabled: user.biometric_enabled,
          pin_enabled: user.pin_enabled,
          first_login: user.first_login,
          preferred_language: user.preferred_language || "en",
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @swagger
 * /api/auth/biometric:
 *   post:
 *     summary: Authenticate via biometric token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - device_id
 *             properties:
 *               user_id:
 *                 type: string
 *               device_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Biometric authentication successful
 */
const biometricAuth = async (req, res, next) => {
  try {
    const { user_id, device_id } = req.body;

    if (!user_id || !device_id) {
      return res.status(400).json({
        success: false,
        message: "Please provide user_id and device_id",
      });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.biometric_enabled) {
      return res.status(403).json({
        success: false,
        message: "Biometric authentication not enabled for this account",
      });
    }

    // Check if device exists in devices array
    const deviceExists = user.devices.some((d) => d.device_id === device_id);

    // Also check legacy device_id field for backward compatibility
    if (!deviceExists && user.device_id !== device_id) {
      return res.status(403).json({
        success: false,
        message: "Device not recognized. Please login with password.",
      });
    }

    // Update last login for the device
    if (deviceExists) {
      const deviceIndex = user.devices.findIndex(
        (d) => d.device_id === device_id,
      );
      user.devices[deviceIndex].last_login = new Date();
      await user.save();
    }

    // Generate token with device_id
    const token = generateToken(user._id, device_id);

    // Create login notification (match login())
    createSystemNotification(
      user._id,
      "New Sign In",
      `You signed in via biometric at ${new Date().toLocaleString()}.`,
      "security",
      { action: "biometric_login", device_id },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Biometric authentication successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          biometric_enabled: user.biometric_enabled,
          pin_enabled: user.pin_enabled,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and remove device session
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_id:
 *                 type: string
 *                 description: Device ID to logout (optional - will use token's device_id if not provided)
 *     responses:
 *       200:
 *         description: Logout successful
 */
const logout = async (req, res, next) => {
  try {
    // Get device_id from request body or from token (set by middleware)
    const device_id = req.body.device_id || req.device_id;
    const user = await User.findById(req.user._id);

    if (!device_id) {
      return res.status(400).json({
        success: false,
        message: "device_id is required",
      });
    }

    // Remove the device from devices array
    user.devices = user.devices.filter((d) => d.device_id !== device_id);

    // Clear old device_id field for backward compatibility
    if (user.device_id === device_id) {
      user.device_id = null;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/change-password:
 *   patch:
 *     summary: Change password (required on first login)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Please provide current and new password",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    // Verify current password
    const isMatch = await user.comparePassword(current_password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password and first_login flag
    user.password = new_password;
    user.first_login = false;

    // Security: keep only the current device session; sign out all others.
    // req.device_id is populated by the auth middleware from the JWT payload.
    const currentDeviceId = req.device_id;
    if (currentDeviceId && user.devices?.length) {
      const currentDevice = user.devices.find(
        (d) => d.device_id === currentDeviceId,
      );
      user.devices = currentDevice ? [currentDevice] : [];
    }

    await user.save();

    // Create security notification
    await createSystemNotification(
      user._id,
      "Password Changed",
      `Your password was changed successfully. All other active sessions have been signed out for your security. If you didn't make this change, please contact support immediately.`,
      "security",
      { action: "password_changed", other_sessions_cleared: true },
    );

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully. All other active sessions have been signed out.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/enable-biometric:
 *   patch:
 *     summary: Enable biometric authentication
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Biometric enabled successfully
 */
const enableBiometric = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    user.biometric_enabled = true;
    await user.save();

    // Create security notification
    await createSystemNotification(
      user._id,
      "Biometric Enabled",
      "Biometric authentication has been enabled on your account.",
      "security",
      { action: "biometric_enabled" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Biometric authentication enabled",
      data: {
        biometric_enabled: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    const response = { ...user.toJSON() };

    // If the user is a driver, include driver profile data
    if (user.role === "driver") {
      const driver = await Driver.findOne({ user_id: user._id });
      if (driver) {
        response.driver = driver.toJSON();
      }
    }

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/profile:
 *   patch:
 *     summary: Update user profile (name and profile picture)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               profile_picture:
 *                 type: string
 *                 description: Cloudinary URL for profile picture
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, profile_picture } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (name && name.trim()) user.name = name.trim();
    if (profile_picture !== undefined) user.profile_picture = profile_picture;

    await user.save();

    // Notify user about profile update
    createSystemNotification(
      user._id,
      "Profile Updated",
      "Your profile has been updated successfully.",
      "account",
      { action: "profile_updated" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email with 6-digit code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email }).select(
      "+email_verification_code +email_verification_expires",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    if (!user.email_verification_code || !user.email_verification_expires) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new one.",
      });
    }

    if (new Date() > user.email_verification_expires) {
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one.",
      });
    }

    if (user.email_verification_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Mark email as verified
    user.email_verified = true;
    user.email_verification_code = undefined;
    user.email_verification_expires = undefined;
    await user.save();

    // Create system notification
    await createSystemNotification(
      user._id,
      "Email Verified",
      "Your email address has been successfully verified. Welcome to UniRide!",
      "account",
      { action: "email_verified" },
    );

    // Generate token (no device_id for email verification)
    const token = generateToken(user._id, null);

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend email verification code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification code sent successfully
 */
const resendVerificationCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

    user.email_verification_code = verificationCode;
    user.email_verification_expires = verificationExpires;
    await user.save();

    // Send verification email
    try {
      await sendEmailVerificationCode({
        name: user.name,
        email: user.email,
        verificationCode,
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email",
      });
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset code sent successfully
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message:
          "If an account with that email exists, a password reset code has been sent.",
      });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

    user.password_reset_code = resetCode;
    user.password_reset_expires = resetExpires;
    await user.save();

    // Send reset email
    try {
      await sendPasswordResetCode({
        name: user.name,
        email: user.email,
        resetCode,
      });
    } catch (emailError) {
      console.error("Error sending password reset email:", emailError.message);
    }

    res.status(200).json({
      success: true,
      message:
        "If an account with that email exists, a password reset code has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await User.findOne({ email }).select(
      "+password_reset_code +password_reset_expires +password",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.password_reset_code || !user.password_reset_expires) {
      return res.status(400).json({
        success: false,
        message: "No password reset request found. Please request a new code.",
      });
    }

    if (new Date() > user.password_reset_expires) {
      return res.status(400).json({
        success: false,
        message: "Reset code has expired. Please request a new one.",
      });
    }

    if (user.password_reset_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset code",
      });
    }

    // Update password
    user.password = newPassword;
    user.password_reset_code = undefined;
    user.password_reset_expires = undefined;

    // Security: clear ALL active device sessions so every logged-in device
    // is immediately invalidated (the auth middleware rejects tokens whose
    // device_id no longer exists in the array).
    const clearedCount = user.devices ? user.devices.length : 0;
    user.devices = [];

    await user.save();

    // Create security notification
    await createSystemNotification(
      user._id,
      "Password Reset",
      `Your password was reset successfully. ${
        clearedCount > 0
          ? `${clearedCount} active session${
              clearedCount !== 1 ? "s have" : " has"
            } been signed out for your security.`
          : "You can now sign in with your new password."
      }`,
      "security",
      { action: "password_reset", sessions_cleared: clearedCount },
    );

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. All active sessions have been signed out. Please sign in again.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/devices:
 *   get:
 *     summary: Get all devices logged in for current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of devices
 */
const getDevices = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      data: {
        devices: user.devices.map((d) => ({
          device_id: d.device_id,
          device_name: d.device_name,
          device_type: d.device_type,
          last_login: d.last_login,
          ip_address: d.ip_address,
        })),
        max_devices:
          user.role === "admin" || user.role === "super_admin"
            ? "unlimited"
            : 3,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/devices/{device_id}:
 *   delete:
 *     summary: Remove a specific device
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: device_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device removed successfully
 */
const removeDevice = async (req, res, next) => {
  try {
    const { device_id } = req.params;
    const user = await User.findById(req.user._id);

    const deviceExists = user.devices.some((d) => d.device_id === device_id);

    if (!deviceExists) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    // Remove the device
    user.devices = user.devices.filter((d) => d.device_id !== device_id);
    await user.save();

    // Security notification
    createSystemNotification(
      user._id,
      "Device Removed",
      "A device has been removed from your account.",
      "security",
      { action: "device_removed", device_id },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Device removed successfully",
      data: {
        devices: user.devices.map((d) => ({
          device_id: d.device_id,
          device_name: d.device_name,
          device_type: d.device_type,
          last_login: d.last_login,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/devices/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               except_current:
 *                 type: boolean
 *                 description: Keep current device logged in
 *               current_device_id:
 *                 type: string
 *                 description: Current device ID to keep (if except_current is true)
 *     responses:
 *       200:
 *         description: Logged out from all devices
 */
const logoutAllDevices = async (req, res, next) => {
  try {
    const { except_current, current_device_id } = req.body;
    const user = await User.findById(req.user._id);

    if (except_current && current_device_id) {
      // Keep only the current device
      user.devices = user.devices.filter(
        (d) => d.device_id === current_device_id,
      );
    } else {
      // Remove all devices
      user.devices = [];
    }

    user.device_id = null; // Clear legacy field
    await user.save();

    // Security notification
    createSystemNotification(
      user._id,
      "All Devices Logged Out",
      except_current
        ? "You have been logged out from all other devices."
        : "You have been logged out from all devices.",
      "security",
      { action: "logout_all_devices", except_current: !!except_current },
      false,
    );

    res.status(200).json({
      success: true,
      message: except_current
        ? "Logged out from all other devices"
        : "Logged out from all devices",
      data: {
        remaining_devices: user.devices.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/disable-biometric:
 *   patch:
 *     summary: Disable biometric authentication
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Biometric disabled successfully
 */
const disableBiometric = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.biometric_enabled = false;
    await user.save();

    // Create security notification
    await createSystemNotification(
      user._id,
      "Biometric Disabled",
      "Biometric authentication has been disabled on your account.",
      "security",
      { action: "biometric_disabled" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "Biometric authentication disabled",
      data: { biometric_enabled: false },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Auth - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: is_read
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: User notifications
 */
const getUserNotifications = async (req, res, next) => {
  try {
    const { limit = 30, is_read } = req.query;
    const query = { user_id: req.user._id };
    if (is_read !== undefined) query.is_read = is_read === "true";

    const notifications = await UserNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unread_count = await UserNotification.countDocuments({
      user_id: req.user._id,
      is_read: false,
    });

    res.status(200).json({
      success: true,
      data: notifications,
      unread_count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Auth - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
const markUserNotificationRead = async (req, res, next) => {
  try {
    const notification = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user._id },
      { is_read: true },
      { new: true },
    );
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/notifications/mark-all-read:
 *   patch:
 *     summary: Mark all user notifications as read
 *     tags: [Auth - Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
const markAllUserNotificationsRead = async (req, res, next) => {
  try {
    await UserNotification.updateMany(
      { user_id: req.user._id, is_read: false },
      { is_read: true },
    );
    res
      .status(200)
      .json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/notifications/{id}:
 *   get:
 *     summary: Get notification detail by ID
 *     tags: [Auth - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification details
 */
const getNotificationDetail = async (req, res, next) => {
  try {
    const notification = await UserNotification.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    // Auto mark as read
    if (!notification.is_read) {
      notification.is_read = true;
      await notification.save();
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/notifications:
 *   delete:
 *     summary: Clear all notifications for current user
 *     tags: [Auth - Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications cleared
 */
const clearAllUserNotifications = async (req, res, next) => {
  try {
    const result = await UserNotification.deleteMany({
      user_id: req.user._id,
    });
    res.status(200).json({
      success: true,
      message: "All notifications cleared",
      deleted_count: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

// ─── PIN Login Endpoints ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/pin/setup:
 *   post:
 *     summary: Set up a 4-digit PIN for quick login
 *     tags: [Auth - Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *               - password
 *             properties:
 *               pin:
 *                 type: string
 *                 minLength: 4
 *                 maxLength: 4
 *                 description: 4-digit PIN
 *               password:
 *                 type: string
 *                 description: Current password for verification
 *     responses:
 *       200:
 *         description: PIN set up successfully
 */
const setupPin = async (req, res, next) => {
  try {
    const { pin, password } = req.body;

    if (!pin || !password) {
      return res.status(400).json({
        success: false,
        message: "PIN and current password are required",
      });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        message: "PIN must be exactly 4 digits",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    // Verify current password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash PIN
    const salt = await bcrypt.genSalt(10);
    user.pin_hash = await bcrypt.hash(pin, salt);
    user.pin_enabled = true;
    await user.save();

    await createSystemNotification(
      user._id,
      "PIN Login Enabled",
      "A 4-digit PIN has been set up for quick sign-in on your account.",
      "security",
      { action: "pin_enabled" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "PIN set up successfully",
      data: { pin_enabled: true },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/pin/update:
 *   patch:
 *     summary: Update your 4-digit PIN
 *     tags: [Auth - Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_pin
 *               - new_pin
 *             properties:
 *               current_pin:
 *                 type: string
 *               new_pin:
 *                 type: string
 *     responses:
 *       200:
 *         description: PIN updated successfully
 */
const updatePin = async (req, res, next) => {
  try {
    const { current_pin, new_pin } = req.body;

    if (!current_pin || !new_pin) {
      return res.status(400).json({
        success: false,
        message: "Current PIN and new PIN are required",
      });
    }

    if (!/^\d{4}$/.test(new_pin)) {
      return res.status(400).json({
        success: false,
        message: "New PIN must be exactly 4 digits",
      });
    }

    const user = await User.findById(req.user._id).select("+pin_hash");

    if (!user.pin_enabled || !user.pin_hash) {
      return res.status(400).json({
        success: false,
        message: "PIN login is not enabled. Set up a PIN first.",
      });
    }

    const pinMatch = await bcrypt.compare(current_pin, user.pin_hash);
    if (!pinMatch) {
      return res.status(401).json({
        success: false,
        message: "Current PIN is incorrect",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.pin_hash = await bcrypt.hash(new_pin, salt);
    await user.save();

    await createSystemNotification(
      user._id,
      "PIN Updated",
      "Your login PIN has been changed successfully.",
      "security",
      { action: "pin_updated" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "PIN updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/pin/remove:
 *   delete:
 *     summary: Remove PIN login
 *     tags: [Auth - Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for verification
 *     responses:
 *       200:
 *         description: PIN removed successfully
 */
const removePin = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required to remove PIN",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Password is incorrect",
      });
    }

    user.pin_hash = undefined;
    user.pin_enabled = false;
    await user.save();

    await createSystemNotification(
      user._id,
      "PIN Login Removed",
      "PIN login has been removed from your account.",
      "security",
      { action: "pin_removed" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "PIN removed successfully",
      data: { pin_enabled: false },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/pin/login:
 *   post:
 *     summary: Login with 4-digit PIN (for returning authenticated users)
 *     tags: [Auth - Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - device_id
 *               - pin
 *             properties:
 *               user_id:
 *                 type: string
 *               device_id:
 *                 type: string
 *               pin:
 *                 type: string
 *     responses:
 *       200:
 *         description: PIN login successful
 */
const pinLogin = async (req, res, next) => {
  try {
    const { user_id, device_id, pin } = req.body;

    if (!user_id || !device_id || !pin) {
      return res.status(400).json({
        success: false,
        message: "user_id, device_id, and pin are required",
      });
    }

    const user = await User.findById(user_id).select("+pin_hash");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.pin_enabled || !user.pin_hash) {
      return res.status(403).json({
        success: false,
        message: "PIN login is not enabled for this account",
      });
    }

    // Check device
    const deviceExists = user.devices.some((d) => d.device_id === device_id);
    if (!deviceExists && user.device_id !== device_id) {
      return res.status(403).json({
        success: false,
        message: "Device not recognized. Please login with password.",
      });
    }

    // Verify PIN
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect PIN",
      });
    }

    // Update last login
    if (deviceExists) {
      const idx = user.devices.findIndex((d) => d.device_id === device_id);
      user.devices[idx].last_login = new Date();
      await user.save();
    }

    const token = generateToken(user._id, device_id);

    // Create login notification (match login())
    createSystemNotification(
      user._id,
      "New Sign In",
      `You signed in via PIN at ${new Date().toLocaleString()}.`,
      "security",
      { action: "pin_login", device_id },
      false,
    );

    res.status(200).json({
      success: true,
      message: "PIN login successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          biometric_enabled: user.biometric_enabled,
          pin_enabled: user.pin_enabled,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/pin/forgot:
 *   post:
 *     summary: Request a 6-digit code to reset PIN (sent to email)
 *     tags: [Auth - Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PIN reset code sent to email
 */
const forgotPin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+pin_reset_code +pin_reset_expires",
    );

    if (!user.pin_enabled) {
      return res.status(400).json({
        success: false,
        message: "PIN login is not enabled on this account",
      });
    }

    const code = generateVerificationCode();
    user.pin_reset_code = code;
    user.pin_reset_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();

    await sendPinResetCode({
      name: user.name,
      email: user.email,
      code,
      subject: "Reset Your PIN - UniRide",
    });

    res.status(200).json({
      success: true,
      message: "A 6-digit PIN reset code has been sent to your email",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/auth/pin/reset:
 *   post:
 *     summary: Reset PIN using a 6-digit code from email
 *     tags: [Auth - Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - new_pin
 *             properties:
 *               code:
 *                 type: string
 *                 description: 6-digit code sent to email
 *               new_pin:
 *                 type: string
 *                 description: New 4-digit PIN
 *     responses:
 *       200:
 *         description: PIN reset successfully
 */
const resetPin = async (req, res, next) => {
  try {
    const { code, new_pin } = req.body;

    if (!code || !new_pin) {
      return res.status(400).json({
        success: false,
        message: "Code and new_pin are required",
      });
    }

    if (!/^\d{4}$/.test(new_pin)) {
      return res.status(400).json({
        success: false,
        message: "PIN must be exactly 4 digits",
      });
    }

    const user = await User.findById(req.user._id).select(
      "+pin_reset_code +pin_reset_expires +pin_hash",
    );

    if (!user.pin_reset_code || !user.pin_reset_expires) {
      return res.status(400).json({
        success: false,
        message: "No PIN reset request found. Please request a new code.",
      });
    }

    if (new Date() > user.pin_reset_expires) {
      user.pin_reset_code = undefined;
      user.pin_reset_expires = undefined;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Reset code has expired. Please request a new one.",
      });
    }

    if (user.pin_reset_code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid reset code",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.pin_hash = await bcrypt.hash(new_pin, salt);
    user.pin_enabled = true;
    user.pin_reset_code = undefined;
    user.pin_reset_expires = undefined;
    await user.save();

    await createSystemNotification(
      user._id,
      "PIN Reset",
      "Your login PIN has been reset successfully.",
      "security",
      { action: "pin_reset" },
      false,
    );

    res.status(200).json({
      success: true,
      message: "PIN has been reset successfully",
      data: { pin_enabled: true },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update language preference ──────────────────────────────────────────────
const updateLanguagePreference = async (req, res, next) => {
  try {
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({
        success: false,
        message: "Language code is required",
      });
    }

    // Verify the language exists in our supported languages
    const lang = await Language.findOne({
      code: language.toLowerCase(),
      is_active: true,
    });
    if (!lang) {
      return res.status(400).json({
        success: false,
        message: "This language is not currently supported",
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      preferred_language: language.toLowerCase(),
    });

    res.status(200).json({
      success: true,
      message: "Language preference updated",
      data: { preferred_language: language.toLowerCase() },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Translate text endpoint ─────────────────────────────────────────────────
const translateUserText = async (req, res, next) => {
  try {
    const { texts, target_language, source_language } = req.body;

    if (!texts || !target_language) {
      return res.status(400).json({
        success: false,
        message: "texts and target_language are required",
      });
    }

    const translated = await translateText(
      texts,
      target_language,
      source_language || "en",
    );

    res.status(200).json({
      success: true,
      data: { translations: translated },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get available languages (public) ────────────────────────────────────────
const getAvailableLanguages = async (req, res, next) => {
  try {
    const languages = await Language.find({ is_active: true })
      .select("code name native_name is_default")
      .sort({ is_default: -1, name: 1 });

    res.status(200).json({
      success: true,
      data: languages,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyEmail,
  resendVerificationCode,
  forgotPassword,
  resetPassword,
  login,
  biometricAuth,
  logout,
  changePassword,
  enableBiometric,
  disableBiometric,
  getMe,
  updateProfile,
  getDevices,
  removeDevice,
  logoutAllDevices,
  getUserNotifications,
  markUserNotificationRead,
  markAllUserNotificationsRead,
  getNotificationDetail,
  clearAllUserNotifications,
  setupPin,
  updatePin,
  removePin,
  pinLogin,
  forgotPin,
  resetPin,
  updateLanguagePreference,
  translateUserText,
  getAvailableLanguages,
};
