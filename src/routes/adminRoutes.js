const express = require("express");
const router = express.Router();
const {
  createAdmin,
  getAllAdmins,
  updateAdmin,
  deleteAdmin,
  getPendingApplications,
  getAllApplications,
  getApplicationDetails,
  approveDriver,
  rejectDriver,
  getAllDrivers,
  getDriverById,
  deleteDriver,
  getAllUsers,
  lookupUsers,
  getCancellationRiskUsers,
  getUserById,
  getUserInsights,
  clearUserDataByScript,
  deleteUser,
  getFarePolicy,
  updateFarePolicy,
  flagUser,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
  getDashboard,
  sendBroadcastMessage,
  getBroadcastHistory,
  adminUpdateDriver,
  resetDriverLicense,
  clearAuditData,
  getAuditSummary,
  getLanguages,
  addLanguage,
  updateLanguage,
  deleteLanguage,
} = require("../controllers/adminController");
const {
  listDeletionRequests,
  getDeletionRequestById,
  approveDeletionRequestForAdmin,
  rejectDeletionRequestForAdmin,
} = require("../controllers/accountDeletionController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management endpoints
 */

// Super admin only routes
router.post("/create", protect, authorize("super_admin"), createAdmin);
router.get("/list", protect, authorize("super_admin"), getAllAdmins);
router.patch("/update/:id", protect, authorize("super_admin"), updateAdmin);
router.delete("/delete/:id", protect, authorize("super_admin"), deleteAdmin);

// Dashboard - Admin and super admin
router.get(
  "/dashboard",
  protect,
  authorize("admin", "super_admin"),
  getDashboard,
);

// Admin and super admin routes
router.get(
  "/drivers/pending",
  protect,
  authorize("admin", "super_admin"),
  getPendingApplications,
);
router.get(
  "/drivers/all",
  protect,
  authorize("admin", "super_admin"),
  getAllApplications,
);
router.get(
  "/drivers/application/:id",
  protect,
  authorize("admin", "super_admin"),
  getApplicationDetails,
);
router.patch(
  "/drivers/approve/:id",
  protect,
  authorize("admin", "super_admin"),
  approveDriver,
);
router.patch(
  "/drivers/reject/:id",
  protect,
  authorize("admin", "super_admin"),
  rejectDriver,
);
router.get(
  "/drivers/list",
  protect,
  authorize("admin", "super_admin"),
  getAllDrivers,
);
router.get(
  "/drivers/:id",
  protect,
  authorize("admin", "super_admin"),
  getDriverById,
);
router.delete(
  "/drivers/delete/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteDriver,
);
router.patch(
  "/drivers/edit/:id",
  protect,
  authorize("admin", "super_admin"),
  adminUpdateDriver,
);
router.patch(
  "/drivers/reset-license/:id",
  protect,
  authorize("admin", "super_admin"),
  resetDriverLicense,
);

// Fare policy
router.get(
  "/fare-policy",
  protect,
  authorize("admin", "super_admin"),
  getFarePolicy,
);
router.patch(
  "/fare-policy",
  protect,
  authorize("admin", "super_admin"),
  updateFarePolicy,
);

// User management
router.get("/users", protect, authorize("admin", "super_admin"), getAllUsers);
router.get(
  "/users/lookup",
  protect,
  authorize("admin", "super_admin"),
  lookupUsers,
);
router.get(
  "/users/cancellation-risk",
  protect,
  authorize("admin", "super_admin"),
  getCancellationRiskUsers,
);
router.get(
  "/users/:id",
  protect,
  authorize("admin", "super_admin"),
  getUserById,
);
router.get(
  "/users/:id/insights",
  protect,
  authorize("admin", "super_admin"),
  getUserInsights,
);
router.post(
  "/users/:id/clear-data",
  protect,
  authorize("admin", "super_admin"),
  clearUserDataByScript,
);
router.delete(
  "/users/delete/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteUser,
);
router.patch(
  "/users/flag/:id",
  protect,
  authorize("admin", "super_admin"),
  flagUser,
);
router.get(
  "/account-deletion-requests",
  protect,
  authorize("admin", "super_admin"),
  listDeletionRequests,
);
router.get(
  "/account-deletion-requests/:id",
  protect,
  authorize("admin", "super_admin"),
  getDeletionRequestById,
);
router.patch(
  "/account-deletion-requests/:id/approve",
  protect,
  authorize("admin", "super_admin"),
  approveDeletionRequestForAdmin,
);
router.patch(
  "/account-deletion-requests/:id/reject",
  protect,
  authorize("admin", "super_admin"),
  rejectDeletionRequestForAdmin,
);

// Notifications
router.get(
  "/notifications",
  protect,
  authorize("admin", "super_admin"),
  getNotifications,
);
router.patch(
  "/notifications/:id/read",
  protect,
  authorize("admin", "super_admin"),
  markNotificationRead,
);
router.patch(
  "/notifications/mark-all-read",
  protect,
  authorize("admin", "super_admin"),
  markAllNotificationsRead,
);
// Clear all notifications MUST come before :id route
router.delete(
  "/notifications/clear-all",
  protect,
  authorize("admin", "super_admin"),
  clearAllNotifications,
);
router.delete(
  "/notifications/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteNotification,
);

// Broadcast messaging
router.post(
  "/broadcast",
  protect,
  authorize("admin", "super_admin"),
  sendBroadcastMessage,
);
router.get(
  "/broadcasts",
  protect,
  authorize("admin", "super_admin"),
  getBroadcastHistory,
);

// Audit data clearing — super admin only
router.get(
  "/audit/summary",
  protect,
  authorize("super_admin"),
  getAuditSummary,
);
router.post("/audit/clear", protect, authorize("super_admin"), clearAuditData);

// Language management — super admin only
router.get(
  "/languages",
  protect,
  authorize("admin", "super_admin"),
  getLanguages,
);
router.post("/languages", protect, authorize("super_admin"), addLanguage);
router.patch(
  "/languages/:id",
  protect,
  authorize("super_admin"),
  updateLanguage,
);
router.delete(
  "/languages/:id",
  protect,
  authorize("super_admin"),
  deleteLanguage,
);

module.exports = router;
