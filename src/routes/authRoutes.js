const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

router.post("/register", authLimiter, register);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationCode);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/login", authLimiter, login);
router.post("/biometric", authLimiter, biometricAuth);
router.post("/logout", protect, logout);
router.patch("/change-password", protect, changePassword);
router.patch("/enable-biometric", protect, enableBiometric);
router.get("/me", protect, getMe);

// Device management routes
router.get("/devices", protect, getDevices);
router.delete("/devices/:device_id", protect, removeDevice);
router.post("/devices/logout-all", protect, logoutAllDevices);

module.exports = router;
