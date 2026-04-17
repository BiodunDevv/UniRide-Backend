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
const Language = require("../models/Language");
const { purgeUserAccount } = require("../services/accountDeletionService");
const CampusLocation = require("../models/CampusLocation");
const {
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendAdminInvitationEmail,
  sendBroadcastEmail,
} = require("../services/emailService");
const {
  sendNotificationToRole,
} = require("../services/pushNotificationService");
const {
  createAndPush,
  createBulkAndPush,
} = require("../services/notificationService");

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

      // Create user (password will be hashed by the pre-save hook)
      user = await User.create({
        name: application.name,
        email: application.email,
        password: temporaryPassword,
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

    // Notify the driver user (in-app + push)
    try {
      await createAndPush(
        user._id,
        "Application Approved! 🎉",
        "Congratulations! Your driver application has been approved. You can now go online and start accepting rides.",
        "account",
        { action: "driver_approved", driver_id: driver._id.toString() },
      );
    } catch (e) {
      console.error("Driver approval user notification failed:", e.message);
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
 * /api/admin/users/{id}:
 *   get:
 *     summary: Get a single user by ID
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
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

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
      // ── Full cascade purge — remove every trace from all collections ──
      const userId = admin._id;

      // Support tickets created by this admin + unassign from assigned tickets
      await SupportTicket.deleteMany({ user_id: userId });
      await SupportTicket.updateMany(
        { assigned_to: userId },
        { $set: { assigned_to: null, status: "open" } },
      );
      await SupportTicket.updateMany(
        { "messages.sender_id": userId },
        { $pull: { messages: { sender_id: userId } } },
      );

      // Notifications
      await UserNotification.deleteMany({ user_id: userId });
      await NotificationSettings.deleteMany({ user_id: userId });
      await AdminNotification.deleteMany({
        reference_id: userId,
        reference_model: "User",
      });
      await AdminNotification.updateMany(
        {},
        { $pull: { read_by: { admin_id: userId } } },
      );

      // Broadcast messages sent by this admin
      await BroadcastMessage.deleteMany({ sent_by: userId });

      // Fare policy — nullify updated_by references
      await FarePolicy.updateMany(
        { updated_by: userId },
        { $set: { updated_by: null } },
      );

      // Driver application reviews by this admin — nullify reviewer
      await DriverApplication.updateMany(
        { reviewed_by: userId },
        { $set: { reviewed_by: null } },
      );

      // Driver approved_by — nullify
      await Driver.updateMany(
        { approved_by: userId },
        { $set: { approved_by: null } },
      );

      // Finally delete the user record
      await User.findByIdAndDelete(userId);

      // Notify remaining admins
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Admin Account Permanently Deleted",
          message: `${req.user.name} permanently deleted admin account: ${admin.name} (${admin.email}) — all associated data purged`,
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
        message: "Admin permanently deleted — all traces removed from database",
      });
    } else {
      // Soft delete — flag the admin
      admin.is_flagged = true;
      await admin.save();

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
      await purgeUserAccount({
        user,
        deletedBy: req.user,
      });

      // Notify admins
      try {
        await AdminNotification.create({
          type: "user_report",
          title: "User Account Permanently Deleted",
          message: `${req.user.name} permanently deleted user: ${user.name} (${user.email}) — all associated data purged`,
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
        message: "User permanently deleted — all traces removed from database",
      });
    } else {
      // Soft delete — flag the user
      user.is_flagged = true;
      await user.save();

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

      // Notify the user they have been flagged
      try {
        await createAndPush(
          user._id,
          "Account Suspended",
          "Your account has been suspended by an administrator. Please contact support for assistance.",
          "account",
          { action: "account_flagged" },
        );
      } catch (e) {
        console.error("User flag notification failed:", e.message);
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
      const linkedUser =
        driver.user_id && driver.user_id._id
          ? await User.findById(driver.user_id._id)
          : null;

      if (!linkedUser) {
        return res.status(404).json({
          success: false,
          message: "Linked driver account not found",
        });
      }

      const driverName = linkedUser.name || "Unknown";
      const driverEmail = linkedUser.email || "Unknown";

      await purgeUserAccount({
        user: linkedUser,
        deletedBy: req.user,
      });

      // Notify admins
      try {
        await AdminNotification.create({
          type: "system_alert",
          title: "Driver Account Permanently Deleted",
          message: `${req.user.name} permanently deleted driver: ${driverName} (${driverEmail}) — all associated data purged (rides, bookings, applications, tickets)`,
          priority: "high",
          metadata: {
            driver_name: driverName,
            driver_email: driverEmail,
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
          "Driver permanently deleted — all traces removed from database (user account, rides, bookings, applications, tickets, notifications)",
      });
    } else {
      // Soft delete — flag the driver's user account
      await User.findByIdAndUpdate(driver.user_id._id, { is_flagged: true });

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

      // Notify the driver they have been flagged
      try {
        await createAndPush(
          driver.user_id._id,
          "Account Suspended",
          "Your driver account has been suspended by an administrator. Please contact support for assistance.",
          "account",
          { action: "driver_account_flagged" },
        );
      } catch (e) {
        console.error("Driver flag notification failed:", e.message);
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

    // Notify the user about their account status change
    try {
      await createAndPush(
        user._id,
        is_flagged ? "Account Suspended" : "Account Reinstated",
        is_flagged
          ? "Your account has been suspended. Please contact support for more information."
          : "Your account has been reinstated. You can now use UniRide again.",
        "account",
        { action: is_flagged ? "account_flagged" : "account_unflagged" },
      );
    } catch (e) {
      console.error("Flag notification failed:", e.message);
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

    // Calculate date range - use new Date() fresh each time to avoid mutation
    const now = new Date();
    let startDate;

    switch (period) {
      case "7days":
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30days":
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90days":
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(
          now.getFullYear() - 1,
          now.getMonth(),
          now.getDate(),
        );
        break;
      case "all":
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const periodMs = Date.now() - startDate.getTime();
    const previousPeriodStart = new Date(startDate.getTime() - periodMs);

    // Execute ALL queries in parallel — split into logical groups
    const [stats, charts, previousPeriod] = await Promise.all([
      // ── Group 1: Counts & Aggregations ────────────────────────────
      Promise.all([
        // Users (0-3)
        User.countDocuments({ role: "user" }),
        User.countDocuments({ role: "user", is_flagged: false }),
        User.countDocuments({ role: "user", is_flagged: true }),
        User.countDocuments({ role: "user", createdAt: { $gte: startDate } }),

        // Drivers (4-8)
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
          { $match: { "user.is_flagged": true } },
          { $count: "total" },
        ]).then((r) => r[0]?.total || 0),
        Driver.countDocuments({ createdAt: { $gte: startDate } }),

        // Applications (9-11)
        DriverApplication.countDocuments({ status: "pending" }),
        DriverApplication.countDocuments({
          status: "approved",
          reviewed_at: { $gte: startDate },
        }),
        DriverApplication.countDocuments({
          status: "rejected",
          reviewed_at: { $gte: startDate },
        }),

        // Rides (12-15)
        Ride.countDocuments(),
        Ride.countDocuments({ status: "completed" }),
        Ride.countDocuments({ status: "cancelled" }),
        Ride.countDocuments({
          status: { $in: ["accepted", "in_progress"] },
        }),

        // Bookings (16-19)
        Booking.countDocuments(),
        Booking.countDocuments({ status: "completed" }),
        Booking.countDocuments({ status: "cancelled" }),
        Booking.countDocuments({
          status: { $in: ["accepted", "in_progress", "pending"] },
        }),

        // Revenue (20)
        Ride.aggregate([
          {
            $match: {
              status: "completed",
              createdAt: { $gte: startDate },
            },
          },
          {
            $group: { _id: null, total: { $sum: "$fare" } },
          },
        ]).then((r) => r[0]?.total || 0),

        // Support (21-23)
        SupportTicket.countDocuments(),
        SupportTicket.countDocuments({ status: "open" }),
        SupportTicket.countDocuments({ status: "closed" }),

        // Admin (24-25)
        User.countDocuments({ role: { $in: ["admin", "super_admin"] } }),
        User.countDocuments({ role: "super_admin" }),

        // Notifications (26)
        AdminNotification.countDocuments({ is_read: false }),

        // Rating (27)
        Booking.aggregate([
          { $match: { rating: { $exists: true, $ne: null } } },
          {
            $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } },
          },
        ]).then((r) => ({
          average: r[0]?.avg || 0,
          total_rated: r[0]?.count || 0,
        })),

        // Locations (28-30)
        CampusLocation.countDocuments({}),
        CampusLocation.countDocuments({ is_active: true }),
        CampusLocation.countDocuments({ is_popular: true }),

        // Check-in rate (31)
        Booking.aggregate([
          { $match: { status: { $in: ["in_progress", "completed"] } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              checked_in: {
                $sum: {
                  $cond: [{ $eq: ["$check_in_status", "checked_in"] }, 1, 0],
                },
              },
            },
          },
        ]).then((r) => ({
          total: r[0]?.total || 0,
          checked_in: r[0]?.checked_in || 0,
        })),

        // Per-seat revenue (32)
        Booking.aggregate([
          {
            $match: {
              status: "completed",
              createdAt: { $gte: startDate },
            },
          },
          {
            $lookup: {
              from: "rides",
              localField: "ride_id",
              foreignField: "_id",
              as: "ride",
            },
          },
          { $unwind: "$ride" },
          {
            $group: {
              _id: null,
              totalSeats: { $sum: "$seats_requested" },
              totalFareRevenue: {
                $sum: {
                  $multiply: ["$ride.fare", "$seats_requested"],
                },
              },
            },
          },
        ]).then((r) => ({
          total_seats_booked: r[0]?.totalSeats || 0,
          total_seat_revenue: r[0]?.totalFareRevenue || 0,
        })),
      ]),

      // ── Group 2: Chart/Timeseries Data ────────────────────────────
      Promise.all([
        // User growth chart (0)
        User.aggregate([
          { $match: { role: "user", createdAt: { $gte: startDate } } },
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

        // Revenue by month (1)
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
                      then: {
                        $concat: ["0", { $toString: "$_id.month" }],
                      },
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

        // Ride status breakdown in period (2)
        Ride.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // Booking status breakdown in period (3)
        Booking.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // Application status (4)
        DriverApplication.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),

        // Payment methods (5)
        Booking.aggregate([
          { $match: { payment_status: "paid" } },
          { $group: { _id: "$payment_method", count: { $sum: 1 } } },
        ]),

        // Fare source (6)
        Ride.aggregate([
          { $group: { _id: "$fare_policy_source", count: { $sum: 1 } } },
        ]),

        // Rating distribution (7)
        Booking.aggregate([
          { $match: { rating: { $exists: true, $ne: null } } },
          { $group: { _id: "$rating", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),

        // Support by priority (8)
        SupportTicket.aggregate([
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),

        // Support by category (9)
        SupportTicket.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),

        // Notifications by type (10)
        AdminNotification.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),

        // Peak hours — when rides are created (11)
        Ride.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $hour: "$departure_time" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              hour: "$_id",
              rides: "$count",
            },
          },
        ]),

        // Top routes (12)
        Ride.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate },
              pickup_location_id: { $exists: true },
              destination_id: { $exists: true },
            },
          },
          {
            $group: {
              _id: {
                pickup: "$pickup_location_id",
                destination: "$destination_id",
              },
              count: { $sum: 1 },
              avg_fare: { $avg: "$fare" },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "campuslocations",
              localField: "_id.pickup",
              foreignField: "_id",
              as: "pickup",
            },
          },
          {
            $lookup: {
              from: "campuslocations",
              localField: "_id.destination",
              foreignField: "_id",
              as: "destination",
            },
          },
          {
            $project: {
              _id: 0,
              pickup_name: {
                $ifNull: [
                  { $arrayElemAt: ["$pickup.short_name", 0] },
                  { $arrayElemAt: ["$pickup.name", 0] },
                  "Unknown pickup",
                ],
              },
              dropoff_name: {
                $ifNull: [
                  { $arrayElemAt: ["$destination.short_name", 0] },
                  { $arrayElemAt: ["$destination.name", 0] },
                  "Unknown destination",
                ],
              },
              count: "$count",
              avg_fare: { $round: ["$avg_fare", 0] },
            },
          },
        ]),

        // Rides per day chart (13)
        Ride.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
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
              rides: "$count",
            },
          },
        ]),
      ]),

      // ── Group 3: Previous Period Comparisons ──────────────────────
      Promise.all([
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
          { $group: { _id: null, total: { $sum: "$fare" } } },
        ]).then((r) => r[0]?.total || 0),
        Booking.countDocuments({
          createdAt: { $gte: previousPeriodStart, $lt: startDate },
        }),
      ]),
    ]);

    // Destructure stats
    const [
      totalUsers,
      activeUsers,
      flaggedUsers,
      newUsersCount,
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      flaggedDrivers,
      newDriversCount,
      pendingApplications,
      approvedApplicationsCount,
      rejectedApplicationsCount,
      totalRides,
      completedRides,
      cancelledRides,
      inProgressRides,
      totalBookings,
      completedBookings,
      cancelledBookings,
      activeBookings,
      totalRevenue,
      totalTickets,
      openTickets,
      closedTickets,
      totalAdmins,
      superAdmins,
      unreadNotifications,
      ratingData,
      totalLocations,
      activeLocations,
      popularLocations,
      checkInData,
      seatRevenue,
    ] = stats;

    const [
      userGrowthData,
      revenueByMonth,
      rideStatusData,
      bookingStatusData,
      applicationStatusData,
      paymentMethodData,
      ridesByFareSource,
      ratingDistribution,
      ticketsByPriority,
      ticketsByCategory,
      notificationsByType,
      peakHoursData,
      topRoutesData,
      ridesPerDayData,
    ] = charts;

    const [
      previousUsers,
      previousDrivers,
      previousRides,
      previousRevenue,
      previousBookings,
    ] = previousPeriod;

    // Growth calculation helper
    const growth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    const periodDays = Math.max(
      1,
      Math.floor(periodMs / (1000 * 60 * 60 * 24)),
    );

    // Build response
    const dashboardData = {
      overview: {
        total_users: totalUsers,
        active_users: activeUsers,
        flagged_users: flaggedUsers,
        new_users_this_period: newUsersCount,
        user_growth_percentage: growth(newUsersCount, previousUsers),

        total_drivers: totalDrivers,
        active_drivers: activeDrivers,
        inactive_drivers: inactiveDrivers,
        flagged_drivers: flaggedDrivers,
        new_drivers_this_period: newDriversCount,
        driver_growth_percentage: growth(newDriversCount, previousDrivers),

        total_rides: totalRides,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        in_progress_rides: inProgressRides,
        ride_completion_rate:
          totalRides > 0
            ? parseFloat(((completedRides / totalRides) * 100).toFixed(2))
            : 0,

        total_bookings: totalBookings,
        completed_bookings: completedBookings,
        cancelled_bookings: cancelledBookings,
        active_bookings: activeBookings,
        booking_growth_percentage: growth(totalBookings, previousBookings),

        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        revenue_growth_percentage: growth(totalRevenue, previousRevenue),
        avg_revenue_per_day:
          periodDays > 0
            ? parseFloat((totalRevenue / periodDays).toFixed(2))
            : 0,

        // Per-seat revenue
        total_seats_booked: seatRevenue.total_seats_booked,
        total_seat_revenue: parseFloat(
          seatRevenue.total_seat_revenue.toFixed(2),
        ),
        avg_fare_per_seat:
          seatRevenue.total_seats_booked > 0
            ? parseFloat(
                (
                  seatRevenue.total_seat_revenue /
                  seatRevenue.total_seats_booked
                ).toFixed(2),
              )
            : 0,

        pending_applications: pendingApplications,
        total_admins: totalAdmins,
        super_admins: superAdmins,
        unread_notifications: unreadNotifications,
        average_rating: parseFloat(ratingData.average.toFixed(2)),
        total_rated_rides: ratingData.total_rated,

        total_locations: totalLocations,
        active_locations: activeLocations,
        popular_locations: popularLocations,

        check_in_rate:
          checkInData.total > 0
            ? parseFloat(
                ((checkInData.checked_in / checkInData.total) * 100).toFixed(2),
              )
            : 0,
      },

      // Chart data
      user_growth_chart: userGrowthData.map((item) => ({
        date: item.date.toISOString().split("T")[0],
        users: item.count,
      })),

      rides_per_day_chart: ridesPerDayData.map((item) => ({
        date: item.date.toISOString().split("T")[0],
        rides: item.rides,
      })),

      ride_status_chart: rideStatusData.map((item) => ({
        status: item._id || "unknown",
        count: item.count,
      })),

      booking_status_chart: bookingStatusData.map((item) => ({
        status: item._id || "unknown",
        count: item.count,
      })),

      revenue_chart: revenueByMonth.map((item) => ({
        month: item.month,
        revenue: parseFloat(item.revenue.toFixed(2)),
        rides: item.rides,
      })),

      application_status_chart: applicationStatusData.map((item) => ({
        status: item._id,
        count: item.count,
      })),

      payment_method_chart: paymentMethodData.map((item) => ({
        method: item._id || "unknown",
        count: item.count,
      })),

      fare_source_chart: ridesByFareSource.map((item) => ({
        source: item._id || "unknown",
        count: item.count,
      })),

      rating_distribution_chart: ratingDistribution.map((item) => ({
        rating: item._id,
        count: item.count,
      })),

      peak_hours_chart: peakHoursData,
      top_routes: topRoutesData,

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

      // Notifications
      notifications: {
        unread: unreadNotifications,
        by_type: notificationsByType.map((item) => ({
          type: item._id,
          count: item.count,
        })),
      },

      // Driver applications
      driver_applications: {
        pending: pendingApplications,
        approved_this_period: approvedApplicationsCount,
        rejected_this_period: rejectedApplicationsCount,
        approval_rate:
          approvedApplicationsCount + rejectedApplicationsCount > 0
            ? parseFloat(
                (
                  (approvedApplicationsCount /
                    (approvedApplicationsCount + rejectedApplicationsCount)) *
                  100
                ).toFixed(2),
              )
            : 0,
      },

      // Period info
      period_info: {
        period,
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

    // ── Resolve target users once ─────────────────────────────────────
    let userFilter = {};
    if (target_audience === "users") userFilter = { role: "user" };
    else if (target_audience === "drivers") userFilter = { role: "driver" };
    else if (target_audience === "admins")
      userFilter = { role: { $in: ["admin", "super_admin"] } };
    // target_audience === "all" → empty filter → all users

    const targetUsers = await User.find(userFilter).select(
      "_id name email role",
    );
    const targetUserIds = targetUsers.map((u) => u._id);

    // ── 1. Save in-app notifications + send push (DB first, then push) ─
    //    Uses dedup_key to prevent duplicates if the request is retried.
    if (notification_type === "push" || notification_type === "both") {
      const { dbCreated, pushResult } = await createBulkAndPush(
        targetUserIds,
        title,
        message,
        "broadcast",
        {
          action: "broadcast_message",
          dedup_key: `broadcast_${broadcast._id}`,
          broadcast_id: broadcast._id.toString(),
          sent_by: req.user.name,
          target_audience,
        },
      );

      broadcast.total_recipients = pushResult.total || targetUserIds.length;
      broadcast.successful_sends = pushResult.successful || 0;
      broadcast.failed_sends = pushResult.failed || 0;
      broadcast.skipped_sends = pushResult.skipped || 0;
    } else {
      // notification_type === "email" only — still save in-app records
      const { dbCreated } = await createBulkAndPush(
        targetUserIds,
        title,
        message,
        "broadcast",
        {
          action: "broadcast_message",
          dedup_key: `broadcast_${broadcast._id}`,
          broadcast_id: broadcast._id.toString(),
          sent_by: req.user.name,
          target_audience,
        },
      );
      broadcast.total_recipients = targetUsers.length;
    }

    // ── 2. Send emails if requested ───────────────────────────────────
    if (notification_type === "email" || notification_type === "both") {
      try {
        const userIds = targetUsers.map((u) => u._id);
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

        for (const user of targetUsers) {
          const userIdStr = user._id.toString();
          if (!settingsMap[userIdStr]) continue;

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

        // Accumulate email stats
        broadcast.total_recipients =
          (broadcast.total_recipients || 0) + targetUsers.length;
        broadcast.successful_sends =
          (broadcast.successful_sends || 0) + emailSuccessCount;
        broadcast.failed_sends = (broadcast.failed_sends || 0) + emailFailCount;

        console.log(
          `📧 Broadcast emails sent: ${emailSuccessCount} successful, ${emailFailCount} failed`,
        );
      } catch (emailError) {
        console.error("Error sending broadcast emails:", emailError.message);
      }
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

    // Notify the driver about admin changes to their profile
    try {
      await createAndPush(
        driver.user_id,
        "Profile Updated by Admin",
        "An administrator has updated your driver profile. Please review the changes in your profile settings.",
        "account",
        { action: "admin_profile_update" },
      );
    } catch (e) {
      console.error("Admin driver update notification failed:", e.message);
    }

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

    // Notify the driver they can update their license again
    try {
      await createAndPush(
        driver.user_id,
        "License Update Available",
        "An administrator has reset your license update restriction. You can now upload a new driver's license.",
        "account",
        { action: "license_reset" },
      );
    } catch (e) {
      console.error("License reset notification failed:", e.message);
    }

    res.status(200).json({
      success: true,
      message:
        "Driver license update restriction has been reset. The driver can now update their license.",
    });
  } catch (error) {
    next(error);
  }
};

// ─── Audit Data Clearing (Super Admin) ────────────────────────────────────────

/**
 * @swagger
 * /api/admin/audit/clear:
 *   post:
 *     summary: Clear audit/historical data (super admin only)
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
 *               - targets
 *             properties:
 *               targets:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [support_tickets, notifications, broadcasts, bookings, ride_history, locations]
 *               before_date:
 *                 type: string
 *                 format: date
 *                 description: Only clear records created before this date
 *     responses:
 *       200:
 *         description: Data cleared successfully
 */
const clearAuditData = async (req, res, next) => {
  try {
    const { targets, before_date } = req.body;

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Please specify which data to clear: support_tickets, notifications, broadcasts, bookings, ride_history, locations",
      });
    }

    const validTargets = [
      "support_tickets",
      "notifications",
      "broadcasts",
      "bookings",
      "ride_history",
      "locations",
    ];
    const invalidTargets = targets.filter((t) => !validTargets.includes(t));
    if (invalidTargets.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid targets: ${invalidTargets.join(", ")}. Valid options: ${validTargets.join(", ")}`,
      });
    }

    const dateFilter = before_date
      ? { createdAt: { $lt: new Date(before_date) } }
      : {};

    // Only clear closed/resolved tickets, not active ones
    const closedTicketFilter = {
      ...dateFilter,
      status: { $in: ["closed", "resolved"] },
    };

    const results = {};

    for (const target of targets) {
      switch (target) {
        case "support_tickets": {
          const deleted = await SupportTicket.deleteMany(closedTicketFilter);
          results.support_tickets = deleted.deletedCount;
          break;
        }
        case "notifications": {
          const deleted = await AdminNotification.deleteMany(dateFilter);
          const userNotifs = await UserNotification.deleteMany(dateFilter);
          results.admin_notifications = deleted.deletedCount;
          results.user_notifications = userNotifs.deletedCount;
          break;
        }
        case "broadcasts": {
          const deleted = await BroadcastMessage.deleteMany(dateFilter);
          results.broadcasts = deleted.deletedCount;
          break;
        }
        case "bookings": {
          const bookingFilter = {
            ...dateFilter,
            status: { $in: ["completed", "cancelled"] },
          };
          const deleted = await Booking.deleteMany(bookingFilter);
          results.bookings = deleted.deletedCount;
          break;
        }
        case "ride_history": {
          const rideFilter = {
            ...dateFilter,
            status: { $in: ["completed", "cancelled"] },
          };
          const deleted = await Ride.deleteMany(rideFilter);
          results.rides = deleted.deletedCount;
          break;
        }
        case "locations": {
          const deleted = await CampusLocation.deleteMany(dateFilter);
          results.locations = deleted.deletedCount;
          break;
        }
      }
    }

    // Log the audit clear action
    try {
      await AdminNotification.create({
        type: "system",
        title: "Audit Data Cleared",
        message: `${req.user.name} cleared audit data: ${targets.join(", ")}${before_date ? ` (before ${before_date})` : ""}`,
        priority: "high",
        metadata: {
          cleared_by: req.user.name,
          cleared_by_id: req.user._id,
          targets,
          before_date: before_date || null,
          results,
          action: "audit_data_cleared",
        },
      });
    } catch (notifErr) {
      console.error("Error creating audit notification:", notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Audit data cleared successfully",
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/admin/audit/summary:
 *   get:
 *     summary: Get summary of clearable audit data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit data summary
 */
const getAuditSummary = async (req, res, next) => {
  try {
    const [
      closedTickets,
      notifications,
      userNotifications,
      broadcasts,
      completedBookings,
      completedRides,
      totalLocations,
    ] = await Promise.all([
      SupportTicket.countDocuments({ status: { $in: ["closed", "resolved"] } }),
      AdminNotification.countDocuments({}),
      UserNotification.countDocuments({}),
      BroadcastMessage.countDocuments({}),
      Booking.countDocuments({ status: { $in: ["completed", "cancelled"] } }),
      Ride.countDocuments({ status: { $in: ["completed", "cancelled"] } }),
      CampusLocation.countDocuments({}),
    ]);

    res.status(200).json({
      success: true,
      data: {
        support_tickets: closedTickets,
        admin_notifications: notifications,
        user_notifications: userNotifications,
        broadcasts,
        bookings: completedBookings,
        rides: completedRides,
        locations: totalLocations,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Language Management (Admin) ──────────────────────────────────────────────

const getLanguages = async (req, res, next) => {
  try {
    const languages = await Language.find({}).sort({ is_default: -1, name: 1 });
    res.status(200).json({ success: true, data: languages });
  } catch (error) {
    next(error);
  }
};

const addLanguage = async (req, res, next) => {
  try {
    const { code, name, native_name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: "Language code and name are required",
      });
    }

    const exists = await Language.findOne({ code: code.toLowerCase() });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "This language already exists",
      });
    }

    const language = await Language.create({
      code: code.toLowerCase(),
      name,
      native_name: native_name || name,
      added_by: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Language added successfully",
      data: language,
    });
  } catch (error) {
    next(error);
  }
};

const updateLanguage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, native_name, is_active } = req.body;

    const language = await Language.findById(id);
    if (!language) {
      return res.status(404).json({
        success: false,
        message: "Language not found",
      });
    }

    if (name) language.name = name;
    if (native_name) language.native_name = native_name;
    if (typeof is_active === "boolean") language.is_active = is_active;

    await language.save();

    res.status(200).json({
      success: true,
      message: "Language updated successfully",
      data: language,
    });
  } catch (error) {
    next(error);
  }
};

const deleteLanguage = async (req, res, next) => {
  try {
    const { id } = req.params;

    const language = await Language.findById(id);
    if (!language) {
      return res.status(404).json({
        success: false,
        message: "Language not found",
      });
    }

    if (language.is_default) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the default language",
      });
    }

    // Reset users who had this language to English
    await User.updateMany(
      { preferred_language: language.code },
      { preferred_language: "en" },
    );

    await Language.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Language deleted and affected users reset to English",
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
  getUserById,
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
};
