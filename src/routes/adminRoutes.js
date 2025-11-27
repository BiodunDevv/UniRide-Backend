const express = require("express");
const router = express.Router();
const {
  createAdmin,
  getAllAdmins,
  updateAdmin,
  deleteAdmin,
  getPendingApplications,
  getAllApplications,
  approveDriver,
  rejectDriver,
  getAllDrivers,
  deleteDriver,
  getAllUsers,
  deleteUser,
  getFarePolicy,
  updateFarePolicy,
  flagUser,
} = require("../controllers/adminController");
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

// Admin and super admin routes
router.get(
  "/drivers/pending",
  protect,
  authorize("admin", "super_admin"),
  getPendingApplications
);
router.get(
  "/drivers/all",
  protect,
  authorize("admin", "super_admin"),
  getAllApplications
);
router.patch(
  "/drivers/approve/:id",
  protect,
  authorize("admin", "super_admin"),
  approveDriver
);
router.patch(
  "/drivers/reject/:id",
  protect,
  authorize("admin", "super_admin"),
  rejectDriver
);
router.get(
  "/drivers/list",
  protect,
  authorize("admin", "super_admin"),
  getAllDrivers
);
router.delete(
  "/drivers/delete/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteDriver
);

// Fare policy
router.get(
  "/fare-policy",
  protect,
  authorize("admin", "super_admin"),
  getFarePolicy
);
router.patch(
  "/fare-policy",
  protect,
  authorize("admin", "super_admin"),
  updateFarePolicy
);

// User management
router.get("/users", protect, authorize("admin", "super_admin"), getAllUsers);
router.delete(
  "/users/delete/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteUser
);
router.patch(
  "/users/flag/:id",
  protect,
  authorize("admin", "super_admin"),
  flagUser
);

module.exports = router;
