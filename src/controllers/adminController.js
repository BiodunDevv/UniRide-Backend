const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const FarePolicy = require("../models/FarePolicy");
const {
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendAdminInvitationEmail,
} = require("../services/emailService");
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
        emailError.message
      );
      // Don't fail the creation if email fails
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

    const application = await DriverApplication.findById(id).populate(
      "user_id"
    );

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

    // Create driver profile
    const driver = await Driver.create({
      user_id: application.user_id._id,
      phone: application.phone,
      vehicle_model: application.vehicle_model,
      plate_number: application.plate_number,
      available_seats: application.available_seats,
      drivers_license: application.drivers_license,
      application_status: "approved",
      approved_by: req.user._id,
      approval_date: new Date(),
      status: "inactive", // Driver needs to go online manually
    });

    // Update user role to driver
    await User.findByIdAndUpdate(application.user_id._id, { role: "driver" });

    // Generate temporary password (first name)
    const temporaryPassword = application.user_id.name.split(" ")[0];

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(temporaryPassword, salt);
    await User.findByIdAndUpdate(application.user_id._id, {
      password: hashedPassword,
      first_login: true,
    });

    // Send approval email with credentials
    try {
      await sendDriverApprovalEmail({
        name: application.user_id.name,
        email: application.user_id.email,
        temporaryPassword,
      });
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError.message);
      // Don't fail the approval if email fails
    }

    res.status(200).json({
      success: true,
      message:
        "Driver approved successfully. Email sent with login credentials.",
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

    const application = await DriverApplication.findById(id).populate(
      "user_id"
    );

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
        name: application.user_id.name,
        email: application.user_id.email,
        rejectionReason: rejection_reason,
      });
    } catch (emailError) {
      console.error("Failed to send rejection email:", emailError.message);
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
      .populate("user_id", "name email")
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

    admin.role = role;
    await admin.save();

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
      return res.status(200).json({
        success: true,
        message: "Admin permanently deleted",
      });
    } else {
      // Soft delete - flag the admin
      admin.is_flagged = true;
      await admin.save();
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
      return res.status(200).json({
        success: true,
        message: "User permanently deleted",
      });
    } else {
      // Soft delete - flag the user
      user.is_flagged = true;
      await user.save();
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
      // Hard delete - permanently remove driver and update user role
      await Driver.findByIdAndDelete(id);
      await User.findByIdAndUpdate(driver.user_id._id, { role: "user" });
      return res.status(200).json({
        success: true,
        message:
          "Driver permanently deleted and user role reverted to regular user",
      });
    } else {
      // Soft delete - flag the driver's user account
      await User.findByIdAndUpdate(driver.user_id._id, { is_flagged: true });
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
      { new: true }
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

module.exports = {
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
};
