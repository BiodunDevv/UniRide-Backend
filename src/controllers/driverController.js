const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const User = require("../models/User");
const {
  sendDriverApplicationReceivedEmail,
} = require("../services/emailService");

/**
 * @swagger
 * /api/driver/apply:
 *   post:
 *     summary: Submit driver application
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicle_model
 *               - plate_number
 *               - drivers_license
 *               - phone
 *             properties:
 *               vehicle_model:
 *                 type: string
 *               plate_number:
 *                 type: string
 *               drivers_license:
 *                 type: string
 *               phone:
 *                 type: string
 *               available_seats:
 *                 type: number
 *     responses:
 *       201:
 *         description: Application submitted successfully
 */
const applyAsDriver = async (req, res, next) => {
  try {
    const {
      vehicle_model,
      plate_number,
      drivers_license,
      phone,
      available_seats,
    } = req.body;

    // Check if user already has a pending or approved application
    const existingApplication = await DriverApplication.findOne({
      user_id: req.user._id,
      status: { $in: ["pending", "approved"] },
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingApplication.status} application`,
      });
    }

    // Check if user is already a driver
    const existingDriver = await Driver.findOne({ user_id: req.user._id });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "You are already registered as a driver",
      });
    }

    // Create application
    const application = await DriverApplication.create({
      user_id: req.user._id,
      vehicle_model,
      plate_number: plate_number.toUpperCase(),
      drivers_license,
      phone,
      available_seats: available_seats || 4,
    });

    // Send application received email
    try {
      await sendDriverApplicationReceivedEmail({
        name: req.user.name,
        email: req.user.email,
        applicationId: application._id,
      });
    } catch (emailError) {
      console.error("Error sending application email:", emailError.message);
      // Continue even if email fails
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
