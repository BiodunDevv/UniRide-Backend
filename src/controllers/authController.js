const Admin = require("../models/Admin");
const Student = require("../models/Student");
const Driver = require("../models/Driver");
const { generateToken } = require("../middlewares/authMiddleware");
const {
  validateDeviceOnLogin,
} = require("../middlewares/deviceLockMiddleware");
const {
  sendPasswordChangeEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const logger = require("../config/logger");
const crypto = require("crypto");

/**
 * Student login with matric number
 */
exports.studentLogin = async (req, res) => {
  try {
    const { matric_no, password, device_id } = req.body;

    if (!matric_no || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide matric number and password",
      });
    }

    // Find student
    const student = await Student.findOne({
      matric_no: matric_no.toUpperCase(),
    })
      .select("+password")
      .populate("college_id", "name code")
      .populate("department_id", "name code");

    if (!student) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Check password
    const isPasswordMatch = await student.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Device lock validation
    if (device_id) {
      const deviceValidation = await validateDeviceOnLogin(student, device_id);
      if (!deviceValidation.success) {
        return res.status(403).json({
          success: false,
          error: deviceValidation.message,
          code: deviceValidation.code,
        });
      }
    }

    // Check if password change is required (first login flag)
    const requiresPasswordChange = student.requires_password_change === true;

    // Generate token
    const token = generateToken(student._id, "student");

    // Remove password from response
    student.password = undefined;

    logger.info(`Student login: ${matric_no}`);

    res.status(200).json({
      success: true,
      token,
      requires_password_change: requiresPasswordChange,
      user: {
        id: student._id,
        matric_no: student.matric_no,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        phone: student.phone,
        college: student.college_id,
        department: student.department_id,
        level: student.level,
        biometric_enabled: student.biometric_enabled,
        is_flagged: student.is_flagged,
      },
    });
  } catch (error) {
    logger.error(`Student login error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during login",
    });
  }
};

/**
 * Driver login with email
 */
exports.driverLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide email and password",
      });
    }

    // Find driver
    const driver = await Driver.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!driver) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Check if driver is approved
    if (driver.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: "Your driver account is not approved yet",
      });
    }

    // Check password
    const isPasswordMatch = await driver.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Generate token
    const token = generateToken(driver._id, "driver");

    // Remove password from response
    driver.password = undefined;

    logger.info(`Driver login: ${email}`);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
        phone: driver.phone,
        status: driver.status,
        rating: driver.rating,
        total_rides: driver.total_rides,
        vehicle: driver.vehicle,
      },
    });
  } catch (error) {
    logger.error(`Driver login error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during login",
    });
  }
};

/**
 * Admin login with email
 */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide email and password",
      });
    }

    // Find admin
    const admin = await Admin.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Check password
    const isPasswordMatch = await admin.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Update last login
    admin.last_login = new Date();
    await admin.save();

    // Generate token
    const token = generateToken(admin._id, "admin");

    // Remove password from response
    admin.password = undefined;

    logger.info(`Admin login: ${email}`);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: admin._id,
        first_name: admin.first_name,
        last_name: admin.last_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    logger.error(`Admin login error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during login",
    });
  }
};

/**
 * Biometric authentication
 */
exports.biometricAuth = async (req, res) => {
  try {
    const { identifier, biometric_token, device_id } = req.body;

    if (!identifier || !biometric_token || !device_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Find student
    const student = await Student.findOne({
      $or: [
        { matric_no: identifier.toUpperCase() },
        { email: identifier.toLowerCase() },
      ],
    });

    if (!student) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Check if biometric is enabled
    if (!student.biometric_enabled) {
      return res.status(403).json({
        success: false,
        error: "Biometric authentication not enabled for this account",
      });
    }

    // Validate device
    if (student.device_id && student.device_id !== device_id) {
      return res.status(403).json({
        success: false,
        error: "Device mismatch",
        code: "DEVICE_MISMATCH",
      });
    }

    // TODO: Validate biometric_token with mobile client's biometric service
    // For now, we trust the client has validated the biometric

    // Generate token
    const token = generateToken(student._id, "student");

    logger.info(`Biometric login: ${student.matric_no}`);

    res.status(200).json({
      success: true,
      token,
      userType: "student",
      user: {
        id: student._id,
        matric_no: student.matric_no,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
      },
    });
  } catch (error) {
    logger.error(`Biometric auth error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during biometric authentication",
    });
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user._id;
    const userType = req.userType;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: "Please provide current and new password",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    }

    // Get user with password
    let user;
    if (userType === "admin") {
      user = await Admin.findById(userId).select("+password");
    } else if (userType === "student") {
      user = await Student.findById(userId).select("+password");
    } else if (userType === "driver") {
      user = await Driver.findById(userId).select("+password");
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(current_password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    // Update password
    user.password = new_password;

    // Mark password change flag as complete for students
    if (userType === "student" && user.requires_password_change) {
      user.requires_password_change = false;
    }

    // Mark first login as complete
    if (user.first_login) {
      user.first_login = false;

      // Activate driver after first password change
      if (userType === "driver") {
        user.status = "active";
      }
    }

    await user.save();

    // Send confirmation email
    const email = user.email;
    const name = user.first_name || user.name;
    await sendPasswordChangeEmail(email, name);

    logger.info(`Password changed for ${userType}: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error(`Change password error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during password change",
    });
  }
};

/**
 * Logout (placeholder for token blacklist implementation)
 */
exports.logout = async (req, res) => {
  try {
    // TODO: Add token to blacklist in Redis
    const userId = req.user._id;
    const userType = req.userType;

    logger.info(`${userType} logout: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during logout",
    });
  }
};

/**
 * Get current user profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    const userType = req.userType;

    let populatedUser;
    if (userType === "student") {
      populatedUser = await Student.findById(user._id)
        .populate("college_id", "name code")
        .populate("department_id", "name code")
        .lean();
    } else {
      populatedUser = user;
    }

    res.status(200).json({
      success: true,
      userType,
      user: populatedUser,
    });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
};

/**
 * Forgot password - Student
 */
exports.studentForgotPassword = async (req, res) => {
  try {
    const { matric_no, email } = req.body;

    if (!matric_no && !email) {
      return res.status(400).json({
        success: false,
        error: "Please provide matric number or email",
      });
    }

    // Find student
    const query = matric_no
      ? { matric_no: matric_no.toUpperCase() }
      : { email: email.toLowerCase() };

    const student = await Student.findOne(query);

    if (!student) {
      // Don't reveal if user exists
      return res.status(200).json({
        success: true,
        message:
          "If the account exists, a password reset code will be sent to the registered email",
      });
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Save reset code and expiry (1 hour)
    student.password_reset_token = resetCode;
    student.password_reset_expires = Date.now() + 3600000; // 1 hour
    await student.save({ validateBeforeSave: false });

    // Send reset email with code
    await sendPasswordResetEmail(
      student.email,
      student.first_name,
      resetCode,
      "student"
    );

    logger.info(`Password reset requested for student: ${student.matric_no}`);

    res.status(200).json({
      success: true,
      message: "A 6-digit password reset code has been sent to your email",
    });
  } catch (error) {
    logger.error(`Student forgot password error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error. Please try again later.",
    });
  }
};

/**
 * Forgot password - Driver
 */
exports.driverForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Please provide your email",
      });
    }

    const driver = await Driver.findOne({ email: email.toLowerCase() });

    if (!driver) {
      return res.status(200).json({
        success: true,
        message:
          "If the account exists, a password reset code will be sent to the registered email",
      });
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    driver.password_reset_token = resetCode;
    driver.password_reset_expires = Date.now() + 3600000;
    await driver.save({ validateBeforeSave: false });

    await sendPasswordResetEmail(
      driver.email,
      driver.name,
      resetCode,
      "driver"
    );

    logger.info(`Password reset requested for driver: ${driver.email}`);

    res.status(200).json({
      success: true,
      message: "A 6-digit password reset code has been sent to your email",
    });
  } catch (error) {
    logger.error(`Driver forgot password error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error. Please try again later.",
    });
  }
};

/**
 * Forgot password - Admin
 */
exports.adminForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Please provide your email",
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(200).json({
        success: true,
        message:
          "If the account exists, a password reset code will be sent to the registered email",
      });
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    admin.password_reset_token = resetCode;
    admin.password_reset_expires = Date.now() + 3600000;
    await admin.save({ validateBeforeSave: false });

    await sendPasswordResetEmail(
      admin.email,
      `${admin.first_name} ${admin.last_name}`,
      resetCode,
      "admin"
    );

    logger.info(`Password reset requested for admin: ${admin.email}`);

    res.status(200).json({
      success: true,
      message: "A 6-digit password reset code has been sent to your email",
    });
  } catch (error) {
    logger.error(`Admin forgot password error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error. Please try again later.",
    });
  }
};

/**
 * Reset password with code
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, matric_no, code, new_password, user_type } = req.body;

    if (!code || !new_password || !user_type) {
      return res.status(400).json({
        success: false,
        error: "Please provide code, new password, and user type",
      });
    }

    if (!email && !matric_no) {
      return res.status(400).json({
        success: false,
        error: "Please provide email or matric number",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
    }

    // Find user by code and check expiry
    let user;
    let Model;
    let query = {
      password_reset_token: code,
      password_reset_expires: { $gt: Date.now() },
    };

    if (user_type === "student") {
      Model = Student;
      // For students, allow lookup by either email or matric_no
      if (matric_no) {
        query.matric_no = matric_no.toUpperCase();
      } else if (email) {
        query.email = email.toLowerCase();
      }
    } else if (user_type === "driver") {
      Model = Driver;
      if (email) {
        query.email = email.toLowerCase();
      }
    } else if (user_type === "admin") {
      Model = Admin;
      if (email) {
        query.email = email.toLowerCase();
      }
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid user type",
      });
    }

    user = await Model.findOne(query);

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    // Update password
    user.password = new_password;
    user.password_reset_token = undefined;
    user.password_reset_expires = undefined;

    // Clear password change requirement if student
    if (user_type === "student" && user.requires_password_change) {
      user.requires_password_change = false;
    }

    await user.save();

    logger.info(
      `Password reset successful for ${user_type}: ${user.email || user.matric_no}`
    );

    res.status(200).json({
      success: true,
      message:
        "Password reset successful. You can now login with your new password.",
    });
  } catch (error) {
    logger.error(`Reset password error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Server error during password reset",
    });
  }
};
