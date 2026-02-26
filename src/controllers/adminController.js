const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const FarePolicy = require("../models/FarePolicy");
const AdminNotification = require("../models/AdminNotification");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const SupportTicket = require("../models/SupportTicket");
const BroadcastMessage = require("../models/BroadcastMessage");
const NotificationSettings = require("../models/NotificationSettings");
const UserNotification = require("../models/UserNotification");
const {
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendAdminInvitationEmail,
  sendBroadcastEmail,
} = require("../services/emailService");
const {
  sendNotificationToRole,
} = require("../services/pushNotificationService");
const bcrypt = require("bcrypt");

/**
 * @swagger
 * /api/admin/create:
 *   post:
 *     summary: Create admin account (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
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
 *         description: Admin created successfully
 */
const createAdmin = async (req, res, next) => {
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

    // Create admin
    const admin = await User.create({
      name,
      email,
      password,
      role: "admin",
      email_verified: false,
      first_login: true,
    });

    // Create notification settings with all notifications enabled by default
    await NotificationSettings.create({
      user_id: admin._id,
      push_notifications_enabled: true,
      email_notifications_enabled: true,
      notification_preferences: {
        new_driver_applications: true,
        user_flagged: true,
        system_alerts: true,
        user_reports: true,
        promotional_messages: true,
        broadcast_messages: true,
      },
    });

    // Send admin invitation email
    try {
      await sendAdminInvitationEmail({
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdBy: req.user.name,
      });
    } catch (emailError) {
      console.error(
        "Failed to send admin invitation email:",
        emailError.message,
      );
      // Don't fail the creation if email fails
    }

    // Create notification for super admins about new admin creation
    try {
      await AdminNotification.create({
        type: "system_alert",
        title: "New Admin Account Created",
        message: `${req.user.name} created a new admin account for ${admin.name} (${admin.email})`,
        reference_id: admin._id,
        reference_model: "User",
        priority: "high",
        metadata: {
          new_admin_name: admin.name,
          new_admin_email: admin.email,
          new_admin_role: admin.role,
          created_by: req.user.name,
          created_by_id: req.user._id,
          action: "admin_created",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(201).json({
      success: true,
      message:
        "Admin created successfully. Invitation email sent. They must verify their email before logging in.",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        email_verified: admin.email_verified,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/pending:
 *   get:
 *     summary: Get all pending driver applications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending applications retrieved
 */
const getPendingApplications = async (req, res, next) => {
  try {
    const applications = await DriverApplication.find({ status: "pending" })
      .populate("user_id", "name email")
      .sort({ submitted_at: -1 });

    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/all:
 *   get:
 *     summary: Get all driver applications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Applications retrieved
 */
const getAllApplications = async (req, res, next) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const applications = await DriverApplication.find(filter)
      .populate("user_id", "name email")
      .populate("reviewed_by", "name email")
      .sort({ submitted_at: -1 });

    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/application/{id}:
 *   get:
 *     summary: Get driver application details by ID
 *     tags: [Admin]
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
 *         description: Application details retrieved successfully
 */
const getApplicationDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await DriverApplication.findById(id)
      .populate("user_id", "name email phone role email_verified createdAt")
      .populate("reviewed_by", "name email role");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/approve/{id}:
 *   patch:
 *     summary: Approve driver application
 *     tags: [Admin]
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
 *         description: Driver approved successfully
 */
const approveDriver = async (req, res, next) => {
  try {
    const { id } = req.params;

    const application =
      await DriverApplication.findById(id).populate("user_id");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application already ${application.status}`,
      });
    }

    // Update application
    application.status = "approved";
    application.reviewed_by = req.user._id;
    application.reviewed_at = new Date();
    await application.save();

    let user;
    let temporaryPassword;

    // Check if user already exists
    const existingUser = await User.findOne({ email: application.email });

    if (existingUser) {
      // User exists - update their role to driver and ensure unflagged
      user = existingUser;
      await User.findByIdAndUpdate(user._id, {
        role: "driver",
        is_flagged: false,
      });

      // Link application to user
      application.user_id = user._id;
      await application.save();
    } else {
      // Create new user account
      // Generate temporary password (first name)
      temporaryPassword = application.name.split(" ")[0];

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(temporaryPassword, salt);

      // Create user
      user = await User.create({
        name: application.name,
        email: application.email,
        password: hashedPassword,
        role: "driver",
        email_verified: false,
        first_login: true,
        is_flagged: false,
      });

      // Create notification settings with all notifications enabled by default
      await NotificationSettings.create({
        user_id: user._id,
        push_notifications_enabled: true,
        email_notifications_enabled: true,
        notification_preferences: {
          new_ride_requests: true,
          booking_confirmed: true,
          payment_received: true,
          promotional_messages: true,
          broadcast_messages: true,
        },
      });

      // Link application to user
      application.user_id = user._id;
      await application.save();
    }

    // Create driver profile
    const driver = await Driver.create({
      user_id: user._id,
      phone: application.phone,
      vehicle_model: application.vehicle_model,
      plate_number: application.plate_number,
      available_seats: application.available_seats,
      drivers_license: application.drivers_license,
      vehicle_image: application.vehicle_image || undefined,
      vehicle_color: application.vehicle_color || undefined,
      vehicle_description: application.vehicle_description || undefined,
      application_status: "approved",
      approved_by: req.user._id,
      approval_date: new Date(),
      status: "inactive", // Driver needs to go online manually
    });

    // Send approval email with credentials (only if new user created)
    try {
      await sendDriverApprovalEmail({
        name: application.name,
        email: application.email,
        temporaryPassword:
          temporaryPassword || "(existing account - use your current password)",
        isNewAccount: !!temporaryPassword,
      });
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError.message);
      // Don't fail the approval if email fails
    }

    // Create notification for all admins about driver approval
    try {
      await AdminNotification.create({
        type: "driver_application",
        title: "Driver Application Approved",
        message: `${application.name}'s driver application was approved by ${req.user.name}`,
        reference_id: driver._id,
        reference_model: "DriverApplication",
        priority: "low",
        metadata: {
          applicant_name: application.name,
          applicant_email: application.email,
          approved_by: req.user.name,
          approved_by_id: req.user._id,
          action: "approved",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: temporaryPassword
        ? "Driver approved successfully. New account created and email sent with login credentials."
        : "Driver approved successfully. Email sent to existing account.",
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/reject/{id}:
 *   patch:
 *     summary: Reject driver application
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejection_reason
 *             properties:
 *               rejection_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver rejected successfully
 */
const rejectDriver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) {
      return res.status(400).json({
        success: false,
        message: "Please provide a rejection reason",
      });
    }

    const application =
      await DriverApplication.findById(id).populate("user_id");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Application already ${application.status}`,
      });
    }

    // Update application
    application.status = "rejected";
    application.reviewed_by = req.user._id;
    application.reviewed_at = new Date();
    application.rejection_reason = rejection_reason;
    await application.save();

    // Send rejection email
    try {
      await sendDriverRejectionEmail({
        name: application.name,
        email: application.email,
        rejectionReason: rejection_reason,
      });
    } catch (emailError) {
      console.error("Failed to send rejection email:", emailError.message);
    }

    // Create notification for all admins about driver rejection
    try {
      await AdminNotification.create({
        type: "driver_application",
        title: "Driver Application Rejected",
        message: `${application.name}'s driver application was rejected by ${req.user.name}`,
        reference_id: application._id,
        reference_model: "DriverApplication",
        priority: "low",
        metadata: {
          applicant_name: application.name,
          applicant_email: application.email,
          rejected_by: req.user.name,
          rejected_by_id: req.user._id,
          rejection_reason: rejection_reason,
          action: "rejected",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Driver application rejected",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/list:
 *   get:
 *     summary: Get all approved drivers
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Drivers retrieved successfully
 */
const getAllDrivers = async (req, res, next) => {
  try {
    const drivers = await Driver.find()
      .populate(
        "user_id",
        "name email phone role email_verified createdAt is_flagged profile_picture",
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: drivers.length,
      data: drivers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/{id}:
 *   get:
 *     summary: Get driver details by ID
 *     tags: [Admin]
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
 *         description: Driver details retrieved successfully
 */
const getDriverById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const driver = await Driver.findById(id)
      .populate(
        "user_id",
        "name email phone role email_verified createdAt is_flagged profile_picture",
      )
      .populate("approved_by", "name email role");

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    res.status(200).json({
      success: true,
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/fare-policy:
 *   get:
 *     summary: Get current fare policy
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fare policy retrieved
 */
const getFarePolicy = async (req, res, next) => {
  try {
    let farePolicy = await FarePolicy.findOne().sort({ updatedAt: -1 });

    if (!farePolicy) {
      farePolicy = await FarePolicy.create({
        mode: "admin",
        base_fare: 500,
        per_km_rate: 50,
        per_minute_rate: 10,
        minimum_fare: 200,
      });
    }

    res.status(200).json({
      success: true,
      data: farePolicy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/fare-policy:
 *   patch:
 *     summary: Update fare policy
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [admin, driver, distance_auto]
 *               base_fare:
 *                 type: number
 *               per_km_rate:
 *                 type: number
 *               per_minute_rate:
 *                 type: number
 *               minimum_fare:
 *                 type: number
 *     responses:
 *       200:
 *         description: Fare policy updated
 */
const updateFarePolicy = async (req, res, next) => {
  try {
    const { mode, base_fare, per_km_rate, per_minute_rate, minimum_fare } =
      req.body;

    let farePolicy = await FarePolicy.findOne().sort({ updatedAt: -1 });

    if (!farePolicy) {
      farePolicy = new FarePolicy();
    }

    // Update fields if provided
    if (mode) farePolicy.mode = mode;
    if (base_fare !== undefined) farePolicy.base_fare = base_fare;
    if (per_km_rate !== undefined) farePolicy.per_km_rate = per_km_rate;
    if (per_minute_rate !== undefined)
      farePolicy.per_minute_rate = per_minute_rate;
    if (minimum_fare !== undefined) farePolicy.minimum_fare = minimum_fare;
    farePolicy.updated_by = req.user._id;

    await farePolicy.save();

    // Create notification about fare policy update
    try {
      await AdminNotification.create({
        type: "system_alert",
        title: "Fare Policy Updated",
        message: `${req.user.name} updated the fare policy settings`,
        reference_id: farePolicy._id,
        reference_model: "FarePolicy",
        priority: "medium",
        metadata: {
          mode: farePolicy.mode,
          base_fare: farePolicy.base_fare,
          per_km_rate: farePolicy.per_km_rate,
          per_minute_rate: farePolicy.per_minute_rate,
          minimum_fare: farePolicy.minimum_fare,
          updated_by: req.user.name,
          updated_by_id: req.user._id,
          action: "fare_policy_updated",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Fare policy updated successfully",
      data: farePolicy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/list:
 *   get:
 *     summary: Get all admins and super admins
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admins retrieved successfully
 */
const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({
      role: { $in: ["admin", "super_admin"] },
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all regular users (excluding drivers and admins)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({
      role: "user",
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/update/{id}:
 *   patch:
 *     summary: Update admin role (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *     responses:
 *       200:
 *         description: Admin updated successfully
 */
const updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !["admin", "super_admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Valid role is required (admin or super_admin)",
      });
    }

    const admin = await User.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!["admin", "super_admin"].includes(admin.role)) {
      return res.status(400).json({
        success: false,
        message: "User is not an admin",
      });
    }

    const previousRole = admin.role;
    admin.role = role;
    await admin.save();

    // Create notification for super admins about role change
    try {
      await AdminNotification.create({
        type: "system_alert",
        title: "Admin Role Updated",
        message: `${req.user.name} changed ${admin.name}'s role from ${previousRole} to ${role}`,
        reference_id: admin._id,
        reference_model: "User",
        priority: "high",
        metadata: {
          admin_name: admin.name,
          admin_email: admin.email,
          previous_role: previousRole,
          new_role: role,
          updated_by: req.user.name,
          updated_by_id: req.user._id,
          action: "admin_role_updated",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Admin role updated successfully",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/delete/{id}:
 *   delete:
 *     summary: Delete admin (soft delete by default, hard delete with ?force=true)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Admin deleted successfully
 */
const deleteAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const admin = await User.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!["admin", "super_admin"].includes(admin.role)) {
      return res.status(400).json({
        success: false,
        message: "User is not an admin",
      });
    }

    if (admin._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete yourself",
      });
    }

    if (force === "true") {
      // Hard delete - permanently remove
      await User.findByIdAndDelete(id);

      // Create notification for super admins about admin deletion
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Admin Account Deleted",
          message: `${req.user.name} permanently deleted admin account: ${admin.name} (${admin.email})`,
          priority: "urgent",
          metadata: {
            deleted_admin_name: admin.name,
            deleted_admin_email: admin.email,
            deleted_admin_role: admin.role,
            deleted_by: req.user.name,
            deleted_by_id: req.user._id,
            action: "admin_hard_deleted",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message: "Admin permanently deleted",
      });
    } else {
      // Soft delete - flag the admin
      admin.is_flagged = true;
      await admin.save();

      // Create notification for super admins about admin flagging
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Admin Account Flagged",
          message: `${req.user.name} flagged admin account: ${admin.name} (${admin.email})`,
          priority: "high",
          metadata: {
            flagged_admin_name: admin.name,
            flagged_admin_email: admin.email,
            flagged_admin_role: admin.role,
            flagged_by: req.user.name,
            flagged_by_id: req.user._id,
            action: "admin_flagged",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Admin flagged successfully. They cannot log in until unflagged.",
        data: admin,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/users/delete/{id}:
 *   delete:
 *     summary: Delete user (soft delete by default, hard delete with ?force=true)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: User deleted successfully
 */
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "user") {
      return res.status(400).json({
        success: false,
        message:
          "This endpoint is only for regular users. Use appropriate endpoint for drivers/admins.",
      });
    }

    if (force === "true") {
      // Hard delete - permanently remove
      await User.findByIdAndDelete(id);

      // Create notification about user deletion
      try {
        await AdminNotification.create({
          type: "user_report",
          title: "User Account Deleted",
          message: `${req.user.name} permanently deleted user account: ${user.name} (${user.email})`,
          priority: "medium",
          metadata: {
            user_name: user.name,
            user_email: user.email,
            deleted_by: req.user.name,
            deleted_by_id: req.user._id,
            action: "user_hard_deleted",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message: "User permanently deleted",
      });
    } else {
      // Soft delete - flag the user
      user.is_flagged = true;
      await user.save();

      // Create notification about user flagging
      try {
        await AdminNotification.create({
          type: "user_report",
          title: "User Account Flagged",
          message: `${req.user.name} flagged user account: ${user.name} (${user.email})`,
          priority: "low",
          metadata: {
            user_name: user.name,
            user_email: user.email,
            flagged_by: req.user.name,
            flagged_by_id: req.user._id,
            action: "user_flagged",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "User flagged successfully. They cannot log in until unflagged.",
        data: user,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/delete/{id}:
 *   delete:
 *     summary: Delete driver (soft delete by default, hard delete with ?force=true)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Driver deleted successfully
 */
const deleteDriver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const driver = await Driver.findById(id).populate("user_id");

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (force === "true") {
      // Hard delete - permanently remove driver, delete application, and update user role
      const driverEmail = driver.user_id.email;

      // Delete the driver profile
      await Driver.findByIdAndDelete(id);

      // Delete all driver applications associated with this email (so they can reapply)
      await DriverApplication.deleteMany({ email: driverEmail });

      // Revert user role to regular user
      await User.findByIdAndUpdate(driver.user_id._id, { role: "user" });

      // Create notification about driver deletion
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Driver Account Deleted",
          message: `${req.user.name} permanently deleted driver: ${driver.user_id.name} (${driver.user_id.email})`,
          priority: "high",
          metadata: {
            driver_name: driver.user_id.name,
            driver_email: driver.user_id.email,
            vehicle: driver.vehicle_model,
            plate_number: driver.plate_number,
            deleted_by: req.user.name,
            deleted_by_id: req.user._id,
            action: "driver_hard_deleted",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Driver permanently deleted, applications removed, and user role reverted to regular user. They can now reapply if desired.",
      });
    } else {
      // Soft delete - flag the driver's user account
      await User.findByIdAndUpdate(driver.user_id._id, { is_flagged: true });

      // Create notification about driver flagging
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Driver Account Flagged",
          message: `${req.user.name} flagged driver: ${driver.user_id.name} (${driver.user_id.email})`,
          priority: "medium",
          metadata: {
            driver_name: driver.user_id.name,
            driver_email: driver.user_id.email,
            vehicle: driver.vehicle_model,
            plate_number: driver.plate_number,
            flagged_by: req.user.name,
            flagged_by_id: req.user._id,
            action: "driver_flagged",
          },
        });
      } catch (notificationError) {
        console.error(
          "Error creating notification:",
          notificationError.message,
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Driver flagged successfully. They cannot log in until unflagged.",
        data: driver,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/users/flag/{id}:
 *   patch:
 *     summary: Flag or unflag a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_flagged
 *             properties:
 *               is_flagged:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User flag status updated
 */
const flagUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_flagged } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { is_flagged },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${is_flagged ? "flagged" : "unflagged"} successfully`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/notifications:
 *   get:
 *     summary: Get all admin notifications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_read
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Limit number of results (default 50)
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
const getNotifications = async (req, res, next) => {
  try {
    const { is_read, type, limit = 50 } = req.query;

    const filter = {};
    if (is_read !== undefined) {
      filter.is_read = is_read === "true";
    }
    if (type) {
      filter.type = type;
    }

    const notifications = await AdminNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("reference_id");

    const unreadCount = await AdminNotification.countDocuments({
      is_read: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unread_count: unreadCount,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Admin]
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
const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await AdminNotification.findByIdAndUpdate(
      id,
      {
        is_read: true,
        $push: {
          read_by: {
            admin_id: req.user._id,
            read_at: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await AdminNotification.updateMany(
      { is_read: false },
      {
        is_read: true,
        $push: {
          read_by: {
            admin_id: req.user._id,
            read_at: new Date(),
          },
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      modified_count: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Admin]
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
 *         description: Notification deleted successfully
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await AdminNotification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/notifications/clear-all:
 *   delete:
 *     summary: Clear all read notifications
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All read notifications cleared
 */
const clearAllNotifications = async (req, res, next) => {
  try {
    const result = await AdminNotification.deleteMany({ is_read: true });

    res.status(200).json({
      success: true,
      message: "All read notifications cleared",
      deleted_count: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7days, 30days, 90days, year, all]
 *         description: Time period for analytics (default 30days)
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
const getDashboard = async (req, res, next) => {
  try {
    const { period = "30days" } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case "7days":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "30days":
        startDate = new Date(now.setDate(now.getDate() - 30));
        break;
      case "90days":
        startDate = new Date(now.setDate(now.getDate() - 90));
        break;
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case "all":
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    // Execute all queries in parallel for maximum speed
    const [
      // User statistics
      totalUsers,
      activeUsers,
      flaggedUsers,
      newUsersCount,
      userGrowthData,

      // Driver statistics
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      flaggedDrivers,
      newDriversCount,

      // Driver application statistics
      pendingApplications,
      approvedApplicationsCount,
      rejectedApplicationsCount,
      applicationStatusData,

      // Ride statistics
      totalRides,
      completedRides,
      cancelledRides,
      inProgressRides,
      rideStatusData,
      ridesByFareSource,

      // Booking statistics
      totalBookings,
      completedBookings,
      cancelledBookings,
      activeBookings,
      bookingStatusData,
      paymentMethodData,

      // Revenue statistics
      totalRevenue,
      revenueByMonth,

      // Support ticket statistics
      totalTickets,
      openTickets,
      closedTickets,
      ticketsByPriority,
      ticketsByCategory,

      // Admin statistics
      totalAdmins,
      superAdmins,

      // Notification statistics
      unreadNotifications,
      notificationsByType,

      // Rating statistics
      averageRating,
      ratingDistribution,
    ] = await Promise.all([
      // User queries
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "user", is_flagged: false }),
      User.countDocuments({ role: "user", is_flagged: true }),
      User.countDocuments({
        role: "user",
        createdAt: { $gte: startDate },
      }),
      User.aggregate([
        {
          $match: {
            role: "user",
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              day: { $dayOfMonth: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        {
          $project: {
            _id: 0,
            date: {
              $dateFromParts: {
                year: "$_id.year",
                month: "$_id.month",
                day: "$_id.day",
              },
            },
            count: 1,
          },
        },
      ]),

      // Driver queries
      Driver.countDocuments(),
      Driver.countDocuments({ status: "active" }),
      Driver.countDocuments({ status: "inactive" }),
      Driver.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "user_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $match: {
            "user.is_flagged": true,
          },
        },
        { $count: "total" },
      ]).then((result) => result[0]?.total || 0),
      Driver.countDocuments({ createdAt: { $gte: startDate } }),

      // Driver application queries
      DriverApplication.countDocuments({ status: "pending" }),
      DriverApplication.countDocuments({
        status: "approved",
        reviewed_at: { $gte: startDate },
      }),
      DriverApplication.countDocuments({
        status: "rejected",
        reviewed_at: { $gte: startDate },
      }),
      DriverApplication.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Ride queries
      Ride.countDocuments(),
      Ride.countDocuments({ status: "completed" }),
      Ride.countDocuments({ status: "cancelled" }),
      Ride.countDocuments({ status: { $in: ["accepted", "in_progress"] } }),
      Ride.aggregate([
        {
          $match: { createdAt: { $gte: startDate } },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Ride.aggregate([
        {
          $group: {
            _id: "$fare_policy_source",
            count: { $sum: 1 },
          },
        },
      ]),

      // Booking queries
      Booking.countDocuments(),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.countDocuments({
        status: { $in: ["active", "accepted", "in_progress"] },
      }),
      Booking.aggregate([
        {
          $match: { createdAt: { $gte: startDate } },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Booking.aggregate([
        {
          $match: { payment_status: "paid" },
        },
        {
          $group: {
            _id: "$payment_method",
            count: { $sum: 1 },
          },
        },
      ]),

      // Revenue queries
      Ride.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$fare" },
          },
        },
      ]).then((result) => result[0]?.total || 0),
      Ride.aggregate([
        {
          $match: {
            status: "completed",
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$fare" },
            rides: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
          $project: {
            _id: 0,
            month: {
              $concat: [
                { $toString: "$_id.year" },
                "-",
                {
                  $cond: {
                    if: { $lt: ["$_id.month", 10] },
                    then: { $concat: ["0", { $toString: "$_id.month" }] },
                    else: { $toString: "$_id.month" },
                  },
                },
              ],
            },
            revenue: 1,
            rides: 1,
          },
        },
      ]),

      // Support ticket queries
      SupportTicket.countDocuments(),
      SupportTicket.countDocuments({ status: "open" }),
      SupportTicket.countDocuments({ status: "closed" }),
      SupportTicket.aggregate([
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
          },
        },
      ]),
      SupportTicket.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
      ]),

      // Admin queries
      User.countDocuments({ role: { $in: ["admin", "super_admin"] } }),
      User.countDocuments({ role: "super_admin" }),

      // Notification queries
      AdminNotification.countDocuments({ is_read: false }),
      AdminNotification.aggregate([
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
          },
        },
      ]),

      // Rating queries
      Booking.aggregate([
        {
          $match: {
            rating: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            average: { $avg: "$rating" },
          },
        },
      ]).then((result) => result[0]?.average || 0),
      Booking.aggregate([
        {
          $match: {
            rating: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Calculate growth percentages
    const calculateGrowthPercentage = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    // Get previous period data for comparison
    let previousPeriodStart;
    const periodDays = Math.floor(
      (new Date() - startDate) / (1000 * 60 * 60 * 24),
    );
    previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

    const [previousUsers, previousDrivers, previousRides, previousRevenue] =
      await Promise.all([
        User.countDocuments({
          role: "user",
          createdAt: { $gte: previousPeriodStart, $lt: startDate },
        }),
        Driver.countDocuments({
          createdAt: { $gte: previousPeriodStart, $lt: startDate },
        }),
        Ride.countDocuments({
          status: "completed",
          createdAt: { $gte: previousPeriodStart, $lt: startDate },
        }),
        Ride.aggregate([
          {
            $match: {
              status: "completed",
              createdAt: { $gte: previousPeriodStart, $lt: startDate },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$fare" },
            },
          },
        ]).then((result) => result[0]?.total || 0),
      ]);

    // Build comprehensive dashboard response
    const dashboardData = {
      overview: {
        total_users: totalUsers,
        active_users: activeUsers,
        flagged_users: flaggedUsers,
        new_users_this_period: newUsersCount,
        user_growth_percentage: calculateGrowthPercentage(
          newUsersCount,
          previousUsers,
        ).toFixed(2),

        total_drivers: totalDrivers,
        active_drivers: activeDrivers,
        inactive_drivers: inactiveDrivers,
        flagged_drivers: flaggedDrivers,
        new_drivers_this_period: newDriversCount,
        driver_growth_percentage: calculateGrowthPercentage(
          newDriversCount,
          previousDrivers,
        ).toFixed(2),

        total_rides: totalRides,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        in_progress_rides: inProgressRides,
        ride_completion_rate:
          totalRides > 0 ? ((completedRides / totalRides) * 100).toFixed(2) : 0,

        total_bookings: totalBookings,
        completed_bookings: completedBookings,
        cancelled_bookings: cancelledBookings,
        active_bookings: activeBookings,

        total_revenue: totalRevenue.toFixed(2),
        revenue_growth_percentage: calculateGrowthPercentage(
          totalRevenue,
          previousRevenue,
        ).toFixed(2),

        pending_applications: pendingApplications,
        total_admins: totalAdmins,
        super_admins: superAdmins,
        unread_notifications: unreadNotifications,
        average_rating: averageRating.toFixed(2),
      },

      // Chart data for user growth
      user_growth_chart: userGrowthData.map((item) => ({
        date: item.date.toISOString().split("T")[0],
        users: item.count,
      })),

      // Chart data for ride status distribution
      ride_status_chart: rideStatusData.map((item) => ({
        status: item._id || "unknown",
        count: item.count,
      })),

      // Chart data for booking status distribution
      booking_status_chart: bookingStatusData.map((item) => ({
        status: item._id || "unknown",
        count: item.count,
      })),

      // Chart data for revenue by month
      revenue_chart: revenueByMonth.map((item) => ({
        month: item.month,
        revenue: parseFloat(item.revenue.toFixed(2)),
        rides: item.rides,
      })),

      // Chart data for application status
      application_status_chart: applicationStatusData.map((item) => ({
        status: item._id,
        count: item.count,
      })),

      // Chart data for payment methods
      payment_method_chart: paymentMethodData.map((item) => ({
        method: item._id || "unknown",
        count: item.count,
      })),

      // Chart data for fare policy source distribution
      fare_source_chart: ridesByFareSource.map((item) => ({
        source: item._id || "unknown",
        count: item.count,
      })),

      // Chart data for rating distribution
      rating_distribution_chart: ratingDistribution.map((item) => ({
        rating: item._id,
        count: item.count,
      })),

      // Support ticket analytics
      support_tickets: {
        total: totalTickets,
        open: openTickets,
        closed: closedTickets,
        by_priority: ticketsByPriority.map((item) => ({
          priority: item._id || "unknown",
          count: item.count,
        })),
        by_category: ticketsByCategory.map((item) => ({
          category: item._id || "unknown",
          count: item.count,
        })),
      },

      // Notification breakdown
      notifications: {
        unread: unreadNotifications,
        by_type: notificationsByType.map((item) => ({
          type: item._id,
          count: item.count,
        })),
      },

      // Driver applications summary
      driver_applications: {
        pending: pendingApplications,
        approved_this_period: approvedApplicationsCount,
        rejected_this_period: rejectedApplicationsCount,
        approval_rate:
          approvedApplicationsCount + rejectedApplicationsCount > 0
            ? (
                (approvedApplicationsCount /
                  (approvedApplicationsCount + rejectedApplicationsCount)) *
                100
              ).toFixed(2)
            : 0,
      },

      // Period information
      period_info: {
        period: period,
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString(),
        days: periodDays,
      },
    };

    res.status(200).json({
      success: true,
      message: "Dashboard data retrieved successfully",
      data: dashboardData,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/broadcast:
 *   post:
 *     summary: Send broadcast message to users, drivers, admins, or all
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *               - target_audience
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               target_audience:
 *                 type: string
 *                 enum: [all, users, drivers, admins]
 *               notification_type:
 *                 type: string
 *                 enum: [push, email, both]
 *                 default: both
 *     responses:
 *       200:
 *         description: Broadcast message sent successfully
 */
const sendBroadcastMessage = async (req, res, next) => {
  try {
    const {
      title,
      message,
      target_audience,
      notification_type = "both",
    } = req.body;

    if (!title || !message || !target_audience) {
      return res.status(400).json({
        success: false,
        message: "Title, message, and target_audience are required",
      });
    }

    // Create broadcast record
    const broadcast = await BroadcastMessage.create({
      title,
      message,
      target_audience,
      notification_type,
      sent_by: req.user._id,
      sent_by_name: req.user.name,
      status: "sending",
    });

    // Send push notifications asynchronously
    if (notification_type === "push" || notification_type === "both") {
      const pushResult = await sendNotificationToRole({
        role: target_audience,
        title,
        message,
        data: {
          broadcast_id: broadcast._id.toString(),
          sent_by: req.user.name,
        },
        notificationType: "broadcast_messages",
      });

      broadcast.total_recipients = pushResult.total || 0;
      broadcast.successful_sends = pushResult.successful || 0;
      broadcast.failed_sends = pushResult.failed || 0;
      broadcast.skipped_sends = pushResult.skipped || 0;
    }

    // Send emails if notification_type is 'email' or 'both'
    if (notification_type === "email" || notification_type === "both") {
      try {
        // Determine which users to send emails to based on target_audience
        let userFilter = {};
        if (target_audience === "users") {
          userFilter = { role: "user" };
        } else if (target_audience === "drivers") {
          userFilter = { role: "driver" };
        } else if (target_audience === "admins") {
          userFilter = { role: { $in: ["admin", "super_admin"] } };
        } else if (target_audience === "all") {
          userFilter = {}; // All users
        }

        // Get users and their notification settings
        const users = await User.find(userFilter).select("name email role");

        // Get notification settings for these users
        const userIds = users.map((u) => u._id);
        const settingsMap = await NotificationSettings.find({
          user_id: { $in: userIds },
          email_notifications_enabled: true,
          "notification_preferences.broadcast_messages": true,
        }).then((settings) => {
          const map = {};
          settings.forEach((s) => {
            map[s.user_id.toString()] = s;
          });
          return map;
        });

        let emailSuccessCount = 0;
        let emailFailCount = 0;

        // Send emails to users who have email notifications enabled
        for (const user of users) {
          const userIdStr = user._id.toString();
          const settings = settingsMap[userIdStr];

          // Skip if user hasn't enabled email notifications or broadcast messages
          if (!settings) {
            continue;
          }

          try {
            await sendBroadcastEmail({
              name: user.name,
              email: user.email,
              role: user.role,
              title,
              message,
              senderName: req.user.name,
              targetAudience: target_audience,
            });
            emailSuccessCount++;
          } catch (emailError) {
            console.error(
              `Failed to send broadcast email to ${user.email}:`,
              emailError.message,
            );
            emailFailCount++;
          }
        }

        // Update broadcast stats to include email sends
        if (notification_type === "email") {
          // Email only
          broadcast.total_recipients = users.length;
          broadcast.successful_sends = emailSuccessCount;
          broadcast.failed_sends = emailFailCount;
        } else {
          // Both push and email
          broadcast.total_recipients += users.length;
          broadcast.successful_sends += emailSuccessCount;
          broadcast.failed_sends += emailFailCount;
        }

        console.log(
          `📧 Broadcast emails sent: ${emailSuccessCount} successful, ${emailFailCount} failed`,
        );
      } catch (emailError) {
        console.error("Error sending broadcast emails:", emailError.message);
        // Don't fail the entire broadcast if emails fail
      }
    }

    // Create in-app notifications for target users
    try {
      let notifFilter = {};
      if (target_audience === "users") notifFilter = { role: "user" };
      else if (target_audience === "drivers") notifFilter = { role: "driver" };
      else if (target_audience === "admins")
        notifFilter = { role: { $in: ["admin", "super_admin"] } };

      const targetUsers = await User.find(notifFilter).select("_id");
      if (targetUsers.length > 0) {
        const notifications = targetUsers.map((u) => ({
          user_id: u._id,
          title,
          message,
          type: "broadcast",
          metadata: {
            broadcast_id: broadcast._id.toString(),
            sent_by: req.user.name,
            target_audience,
          },
        }));
        await UserNotification.insertMany(notifications);
        console.log(`📬 Created ${notifications.length} in-app notifications`);
      }
    } catch (notifError) {
      console.error("Error creating in-app notifications:", notifError.message);
    }

    broadcast.status = "completed";
    broadcast.completed_at = new Date();
    await broadcast.save();

    res.status(200).json({
      success: true,
      message: "Broadcast message sent successfully",
      data: {
        broadcast_id: broadcast._id,
        total_recipients: broadcast.total_recipients,
        successful_sends: broadcast.successful_sends,
        skipped_sends: broadcast.skipped_sends || 0,
        failed_sends: broadcast.failed_sends,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/broadcasts:
 *   get:
 *     summary: Get all broadcast messages history
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Limit number of results (default 20)
 *     responses:
 *       200:
 *         description: Broadcast history retrieved
 */
const getBroadcastHistory = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;

    const broadcasts = await BroadcastMessage.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("sent_by", "name email role");

    res.status(200).json({
      success: true,
      count: broadcasts.length,
      data: broadcasts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/edit/{id}:
 *   patch:
 *     summary: Admin edit driver details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Driver ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               vehicle_model:
 *                 type: string
 *               plate_number:
 *                 type: string
 *               available_seats:
 *                 type: number
 *               vehicle_color:
 *                 type: string
 *               vehicle_description:
 *                 type: string
 *               bank_name:
 *                 type: string
 *               bank_account_number:
 *                 type: string
 *               bank_account_name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [inactive, active]
 *     responses:
 *       200:
 *         description: Driver updated successfully
 */
const adminUpdateDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const allowedFields = [
      "phone",
      "vehicle_model",
      "plate_number",
      "available_seats",
      "vehicle_color",
      "vehicle_description",
      "bank_name",
      "bank_account_number",
      "bank_account_name",
      "status",
      "vehicle_image",
      "drivers_license",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        driver[field] = req.body[field];
      }
    }

    await driver.save();

    const updated = await Driver.findById(driver._id).populate(
      "user_id",
      "name email role email_verified is_flagged createdAt profile_picture",
    );

    res.status(200).json({
      success: true,
      message: "Driver updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/drivers/reset-license/{id}:
 *   patch:
 *     summary: Admin reset driver's license update restriction
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Driver ID
 *     responses:
 *       200:
 *         description: License restriction reset successfully
 */
const resetDriverLicense = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    driver.license_last_updated = null;
    await driver.save();

    res.status(200).json({
      success: true,
      message:
        "Driver license update restriction has been reset. The driver can now update their license.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
