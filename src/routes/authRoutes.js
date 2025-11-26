const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const {
  validateLogin,
  validatePasswordChange,
  validateBiometricAuth,
} = require("../middlewares/validateMiddleware");
const { deviceLockMiddleware } = require("../middlewares/deviceLockMiddleware");
const { createRateLimiter } = require("../middlewares/rateLimiter");

const loginLimiter = createRateLimiter("auth:login", 5, 900); // 5 requests per 15 minutes

/**
 * @swagger
 * /api/auth/student/login:
 *   post:
 *     summary: Student login with matric number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - matric_no
 *               - password
 *             properties:
 *               matric_no:
 *                 type: string
 *                 example: BU22CSC1005
 *               password:
 *                 type: string
 *               device_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                 requires_password_change:
 *                   type: boolean
 *       401:
 *         description: Invalid credentials
 */
router.post("/student/login", loginLimiter, authController.studentLogin);

/**
 * @swagger
 * /api/auth/driver/login:
 *   post:
 *     summary: Driver login with email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/driver/login", loginLimiter, authController.driverLogin);

/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     summary: Admin login with email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/admin/login", loginLimiter, authController.adminLogin);

/**
 * @swagger
 * /api/auth/biometric:
 *   post:
 *     summary: Biometric authentication for students
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               matric_no:
 *                 type: string
 *               biometric_token:
 *                 type: string
 *               device_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Biometric auth successful
 */
router.post("/biometric", validateBiometricAuth, authController.biometricAuth);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Change password (requires authentication)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.put(
  "/change-password",
  protect,
  validatePasswordChange,
  authController.changePassword
);

/**
 * @swagger
 * /api/auth/student/forgot-password:
 *   post:
 *     summary: Request password reset code for student
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               matric_no:
 *                 type: string
 *                 description: Student matric number
 *                 example: BU22CSC1005
 *               email:
 *                 type: string
 *                 description: Student email (alternative to matric_no)
 *                 example: student@student.bowen.edu.ng
 *     responses:
 *       200:
 *         description: 6-digit reset code sent to email
 */
router.post("/student/forgot-password", authController.studentForgotPassword);

/**
 * @swagger
 * /api/auth/driver/forgot-password:
 *   post:
 *     summary: Request password reset code for driver
 *     tags: [Authentication]
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
 *                 example: driver@example.com
 *     responses:
 *       200:
 *         description: 6-digit reset code sent to email
 */
router.post("/driver/forgot-password", authController.driverForgotPassword);

/**
 * @swagger
 * /api/auth/admin/forgot-password:
 *   post:
 *     summary: Request password reset code for admin
 *     tags: [Authentication]
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
 *                 example: admin@bowen.edu.ng
 *     responses:
 *       200:
 *         description: 6-digit reset code sent to email
 */
router.post("/admin/forgot-password", authController.adminForgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with 6-digit code
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - new_password
 *               - user_type
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email (required for driver/admin)
 *                 example: user@example.com
 *               matric_no:
 *                 type: string
 *                 description: Matric number (alternative for students)
 *                 example: BU22CSC1005
 *               code:
 *                 type: string
 *                 description: 6-digit reset code from email
 *                 example: "123456"
 *               new_password:
 *                 type: string
 *                 example: newSecurePassword123
 *               user_type:
 *                 type: string
 *                 enum: [student, driver, admin]
 *                 example: student
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired code
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout current user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post("/logout", protect, authController.logout);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get("/profile", protect, authController.getProfile);

module.exports = router;
