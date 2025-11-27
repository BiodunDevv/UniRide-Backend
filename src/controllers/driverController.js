const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const User = require("../models/User");
const AdminNotification = require("../models/AdminNotification");
const {
  sendDriverApplicationReceivedEmail,
} = require("../services/emailService");

/**
 * @swagger
 * /api/driver/apply:
 *   post:
 *     summary: Submit driver application (Public - No authentication required)
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - vehicle_model
 *               - plate_number
 *               - drivers_license
 *             properties:
 *               name:
 *                 type: string
 *                 description: Full name of applicant
 *               email:
 *                 type: string
 *                 description: Email address
 *               phone:
 *                 type: string
 *                 description: Phone number
 *               vehicle_model:
 *                 type: string
 *                 description: Vehicle make and model
 *               plate_number:
 *                 type: string
 *                 description: Vehicle plate number
 *               drivers_license:
 *                 type: string
 *                 description: Driver's license image URL (upload image to Cloudinary or cloud storage first, then submit the URL)
 *                 example: https://res.cloudinary.com/example/image/upload/v1234567890/license.jpg
 *               available_seats:
 *                 type: number
 *                 description: Number of available seats (default 4)
 *     responses:
 *       201:
 *         description: Application submitted successfully
 */
const applyAsDriver = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      vehicle_model,
      plate_number,
      drivers_license,
      available_seats,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !email ||
      !phone ||
      !vehicle_model ||
      !plate_number ||
      !drivers_license
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: name, email, phone, vehicle_model, plate_number, drivers_license",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Check if email already has a pending or approved application
    const existingApplication = await DriverApplication.findOne({
      email: email.toLowerCase(),
      status: { $in: ["pending", "approved"] },
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: `An application with this email already exists with status: ${existingApplication.status}`,
      });
    }

    // Check if email is already registered as a driver
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.role === "driver") {
      return res.status(400).json({
        success: false,
        message: "This email is already registered as a driver",
      });
    }

    // Create application (without user_id since they haven't registered yet)
    const application = await DriverApplication.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      vehicle_model: vehicle_model.trim(),
      plate_number: plate_number.toUpperCase().trim(),
      drivers_license: drivers_license.trim(),
      available_seats: available_seats || 4,
    });

    // Send application received email
    try {
      await sendDriverApplicationReceivedEmail({
        name: application.name,
        email: application.email,
        applicationId: application._id,
      });
    } catch (emailError) {
      console.error("Error sending application email:", emailError.message);
      // Continue even if email fails
    }

    // Create admin notification
    try {
      await AdminNotification.create({
        type: "driver_application",
        title: "New Driver Application",
        message: `${application.name} has submitted a driver application`,
        reference_id: application._id,
        reference_model: "DriverApplication",
        priority: "medium",
        metadata: {
          applicant_name: application.name,
          applicant_email: application.email,
          vehicle_model: application.vehicle_model,
          plate_number: application.plate_number,
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
      // Continue even if notification fails
    }

    res.status(201).json({
      success: true,
      message:
        "Driver application submitted successfully. You will be notified via email once reviewed.",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/driver/status:
 *   get:
 *     summary: Check application status
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Application status retrieved
 */
const getApplicationStatus = async (req, res, next) => {
  try {
    const application = await DriverApplication.findOne({
      user_id: req.user._id,
    })
      .sort({ submitted_at: -1 })
      .populate("reviewed_by", "name email");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "No application found",
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
 * /api/driver/profile:
 *   get:
 *     summary: Get driver profile
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver profile retrieved
 */
const getDriverProfile = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id }).populate(
      "user_id",
      "name email"
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
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
 * /api/driver/profile:
 *   patch:
 *     summary: Update driver profile or add bank info
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               bank_name:
 *                 type: string
 *               bank_account_number:
 *                 type: string
 *               bank_account_name:
 *                 type: string
 *               available_seats:
 *                 type: number
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
const updateDriverProfile = async (req, res, next) => {
  try {
    const {
      phone,
      bank_name,
      bank_account_number,
      bank_account_name,
      available_seats,
    } = req.body;

    const driver = await Driver.findOne({ user_id: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // Update fields if provided
    if (phone) driver.phone = phone;
    if (bank_name) driver.bank_name = bank_name;
    if (bank_account_number) driver.bank_account_number = bank_account_number;
    if (bank_account_name) driver.bank_account_name = bank_account_name;
    if (available_seats) driver.available_seats = available_seats;

    await driver.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/driver/toggle-status:
 *   patch:
 *     summary: Toggle driver availability (active/inactive)
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status toggled successfully
 */
const toggleDriverStatus = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // Toggle status
    driver.status = driver.status === "active" ? "inactive" : "active";
    await driver.save();

    res.status(200).json({
      success: true,
      message: `Driver status set to ${driver.status}`,
      data: {
        status: driver.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyAsDriver,
  getApplicationStatus,
  getDriverProfile,
  updateDriverProfile,
  toggleDriverStatus,
};
