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
  disableBiometric,
  getMe,
  updateProfile,
  getDevices,
  removeDevice,
  logoutAllDevices,
  getUserNotifications,
  getNotificationDetail,
  markUserNotificationRead,
  markAllUserNotificationsRead,
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
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication & account management
 *   - name: Auth - Notifications
 *     description: User in-app notification management
 *   - name: Auth - Security
 *     description: Biometric, PIN, and device security
 */

// ── Public Auth ─────────────────────────────────────────────────────────────
router.post("/register", authLimiter, register);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationCode);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/login", authLimiter, login);
router.post("/biometric", authLimiter, biometricAuth);
router.post("/pin/login", authLimiter, pinLogin);

// ── Protected Auth ──────────────────────────────────────────────────────────
router.post("/logout", protect, logout);
router.patch("/change-password", protect, changePassword);
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);

// ── Security (Biometric & PIN) ──────────────────────────────────────────────
router.patch("/enable-biometric", protect, enableBiometric);
router.patch("/disable-biometric", protect, disableBiometric);
router.post("/pin/setup", protect, setupPin);
router.patch("/pin/update", protect, updatePin);
router.delete("/pin/remove", protect, removePin);
router.post("/pin/forgot", protect, forgotPin);
router.post("/pin/reset", protect, resetPin);

// ── Notifications ───────────────────────────────────────────────────────────
router.get("/notifications", protect, getUserNotifications);
router.get("/notifications/:id", protect, getNotificationDetail);
router.patch("/notifications/:id/read", protect, markUserNotificationRead);
router.patch(
  "/notifications/mark-all-read",
  protect,
  markAllUserNotificationsRead,
);
router.delete("/notifications", protect, clearAllUserNotifications);

// ── Device Management ───────────────────────────────────────────────────────
router.get("/devices", protect, getDevices);
router.delete("/devices/:device_id", protect, removeDevice);
router.post("/devices/logout-all", protect, logoutAllDevices);

// ── Language & Translation ──────────────────────────────────────────────────
router.get("/languages", getAvailableLanguages);
router.patch("/language", protect, updateLanguagePreference);
router.post("/translate", protect, translateUserText);

module.exports = router;
