const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const NotificationSettings = require("../models/NotificationSettings");
const { v4: uuidv4 } = require("uuid");
const generateVerificationCode = require("../utils/generateVerificationCode");
const {
  sendEmailVerificationCode,
  sendPasswordResetCode,
} = require("../services/emailService");

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
 *     responses:
 *       201:
 *         description: User registered successfully, verification code sent
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

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
      role: "user",
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
 *     responses:
 *       200:
 *         description: Login successful
 */
const login = async (req, res, next) => {
  try {
    const { email, password, device_id } = req.body;

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
      (d) => d.device_id === device_id
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
          first_login: user.first_login,
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
        (d) => d.device_id === device_id
      );
      user.devices[deviceIndex].last_login = new Date();
      await user.save();
    }

    // Generate token with device_id
    const token = generateToken(user._id, device_id);

    res.status(200).json({
      success: true,
      message: "Biometric authentication successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
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
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
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

    res.status(200).json({
      success: true,
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
      "+email_verification_code +email_verification_expires"
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
      "+password_reset_code +password_reset_expires +password"
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
    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. You can now login with your new password.",
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
        (d) => d.device_id === current_device_id
      );
    } else {
      // Remove all devices
      user.devices = [];
    }

    user.device_id = null; // Clear legacy field
    await user.save();

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
  getMe,
  getDevices,
  removeDevice,
  logoutAllDevices,
};
