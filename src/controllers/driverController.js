const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const User = require("../models/User");
const AdminNotification = require("../models/AdminNotification");
const UserNotification = require("../models/UserNotification");
const { createAndPush } = require("../services/notificationService");
const {
  sendDriverApplicationReceivedEmail,
} = require("../services/emailService");

// Nigerian bank list for validation
const NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Polaris Bank", code: "076" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
  { name: "Globus Bank", code: "00103" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Kuda Microfinance Bank", code: "50211" },
  { name: "Moniepoint Microfinance Bank", code: "50515" },
  { name: "Opay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Providus Bank", code: "101" },
  { name: "SunTrust Bank", code: "100" },
  { name: "TAJ Bank", code: "302" },
  { name: "Titan Trust Bank", code: "102" },
  { name: "VFD Microfinance Bank", code: "566" },
];

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
 *               vehicle_image:
 *                 type: string
 *                 description: Vehicle photo URL (optional - upload to Cloudinary first)
 *                 example: https://res.cloudinary.com/example/image/upload/v1234567890/vehicle.jpg
 *               vehicle_color:
 *                 type: string
 *                 description: Color of the vehicle (optional)
 *                 example: Silver
 *               vehicle_description:
 *                 type: string
 *                 description: Additional vehicle details (optional, max 500 chars)
 *                 example: Clean 4-door sedan with tinted windows
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
      vehicle_image,
      vehicle_color,
      vehicle_description,
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
      vehicle_image: vehicle_image?.trim() || undefined,
      vehicle_color: vehicle_color?.trim() || undefined,
      vehicle_description: vehicle_description?.trim() || undefined,
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
      "name email",
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
 *               vehicle_image:
 *                 type: string
 *               vehicle_color:
 *                 type: string
 *               vehicle_description:
 *                 type: string
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
      vehicle_image,
      vehicle_color,
      vehicle_description,
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
    if (vehicle_image !== undefined) driver.vehicle_image = vehicle_image;
    if (vehicle_color !== undefined) driver.vehicle_color = vehicle_color;
    if (vehicle_description !== undefined)
      driver.vehicle_description = vehicle_description;

    await driver.save();

    // Notify driver about profile update (DB + push)
    await createAndPush(
      req.user._id,
      "Driver Profile Updated",
      "Your driver profile has been updated successfully.",
      "account",
      { action: "driver_profile_updated" },
    );

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

/**
 * @swagger
 * /api/driver/license:
 *   patch:
 *     summary: Update driver's license (once per year)
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
 *               - drivers_license
 *             properties:
 *               drivers_license:
 *                 type: string
 *                 description: New license image URL (Cloudinary)
 *     responses:
 *       200:
 *         description: License updated successfully
 *       400:
 *         description: License can only be updated once per year
 */
const updateDriverLicense = async (req, res, next) => {
  try {
    const { drivers_license } = req.body;

    if (!drivers_license) {
      return res.status(400).json({
        success: false,
        message: "Driver's license image URL is required",
      });
    }

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // Check if license was updated within the last year
    if (driver.license_last_updated) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      if (driver.license_last_updated > oneYearAgo) {
        const nextUpdate = new Date(driver.license_last_updated);
        nextUpdate.setFullYear(nextUpdate.getFullYear() + 1);
        return res.status(400).json({
          success: false,
          message: `License can only be updated once per year. Next update available on ${nextUpdate.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`,
          next_update: nextUpdate,
        });
      }
    }

    driver.drivers_license = drivers_license;
    driver.license_last_updated = new Date();
    await driver.save();

    // Notify driver about license update (DB + push)
    await createAndPush(
      req.user._id,
      "License Updated",
      "Your driver's license has been updated successfully.",
      "account",
      { action: "license_updated" },
    );

    res.status(200).json({
      success: true,
      message: "Driver's license updated successfully",
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/driver/vehicle-image:
 *   patch:
 *     summary: Update vehicle image
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
 *               - vehicle_image
 *             properties:
 *               vehicle_image:
 *                 type: string
 *                 description: Vehicle image URL (Cloudinary)
 *     responses:
 *       200:
 *         description: Vehicle image updated successfully
 */
const updateVehicleImage = async (req, res, next) => {
  try {
    const { vehicle_image } = req.body;

    if (!vehicle_image) {
      return res.status(400).json({
        success: false,
        message: "Vehicle image URL is required",
      });
    }

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    driver.vehicle_image = vehicle_image;
    await driver.save();

    // Notify driver about vehicle image update (DB + push)
    await createAndPush(
      req.user._id,
      "Vehicle Image Updated",
      "Your vehicle image has been updated successfully.",
      "account",
      { action: "vehicle_image_updated" },
    );

    res.status(200).json({
      success: true,
      message: "Vehicle image updated successfully",
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/driver/verify-bank:
 *   post:
 *     summary: Verify bank account number and get account name
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
 *               - account_number
 *               - bank_code
 *             properties:
 *               account_number:
 *                 type: string
 *                 description: 10-digit bank account number
 *                 example: "0123456789"
 *               bank_code:
 *                 type: string
 *                 description: Bank code from the /banks endpoint
 *                 example: "058"
 *     responses:
 *       200:
 *         description: Account verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     account_name:
 *                       type: string
 *                     account_number:
 *                       type: string
 *                     bank_id:
 *                       type: number
 *       400:
 *         description: Invalid account number or could not verify
 *       429:
 *         description: Rate limited — too many requests
 */
const verifyBankAccount = async (req, res, next) => {
  try {
    const { account_number, bank_code } = req.body;

    if (!account_number || !bank_code) {
      return res.status(400).json({
        success: false,
        message: "Account number and bank code are required",
      });
    }

    if (account_number.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Account number must be 10 digits",
      });
    }

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      return res.status(500).json({
        success: false,
        message: "Bank verification service is not configured",
      });
    }

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
        },
      },
    );

    // Handle rate limiting
    if (response.status === 429) {
      return res.status(429).json({
        success: false,
        message:
          "Verification service is temporarily busy. Please wait a moment and try again.",
        code: "RATE_LIMITED",
      });
    }

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({
        success: false,
        message: data.message || "Could not verify account",
      });
    }

    res.status(200).json({
      success: true,
      message: "Account verified successfully",
      data: {
        account_name: data.data.account_name,
        account_number: data.data.account_number,
        bank_id: data.data.bank_id,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/driver/banks:
 *   get:
 *     summary: Get list of Nigerian banks
 *     tags: [Driver]
 *     responses:
 *       200:
 *         description: Bank list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Access Bank"
 *                       code:
 *                         type: string
 *                         example: "044"
 *                       slug:
 *                         type: string
 *                       type:
 *                         type: string
 *                       active:
 *                         type: boolean
 */
const getBankList = async (req, res, next) => {
  try {
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;

    // If Paystack key is available, fetch live bank list
    if (
      paystackKey &&
      paystackKey !== "sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    ) {
      const response = await fetch(
        "https://api.paystack.co/bank?country=nigeria&perPage=100",
        {
          headers: {
            Authorization: `Bearer ${paystackKey}`,
          },
        },
      );
      const result = await response.json();
      if (result.status && result.data) {
        const banks = result.data
          .map((b) => ({
            name: b.name,
            code: b.code,
            slug: b.slug,
            type: b.type,
            active: b.active,
          }))
          .filter((b) => b.active);
        return res.status(200).json({
          success: true,
          count: banks.length,
          data: banks,
        });
      }
    }

    // Fallback to static list
    res.status(200).json({
      success: true,
      count: NIGERIAN_BANKS.length,
      data: NIGERIAN_BANKS,
    });
  } catch (error) {
    // On network error, fall back to static list
    res.status(200).json({
      success: true,
      count: NIGERIAN_BANKS.length,
      data: NIGERIAN_BANKS,
    });
  }
};

/**
 * @swagger
 * /api/driver/check-status:
 *   post:
 *     summary: Check driver application status by email (Public - No auth required)
 *     tags: [Driver]
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
 *                 description: Email used in the driver application
 *     responses:
 *       200:
 *         description: Application status retrieved
 *       404:
 *         description: No application found
 */
const checkApplicationByEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const application = await DriverApplication.findOne({
      email: email.trim().toLowerCase(),
    }).select(
      "name email vehicle_model plate_number vehicle_color available_seats status submitted_at reviewed_at rejection_reason createdAt",
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "No driver application found for this email address",
        code: "NOT_FOUND",
      });
    }

    res.status(200).json({
      success: true,
      message: "Application found",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

const { getIO } = require("../utils/socketManager");

// ─── Go Online ──────────────────────────────────────────────────────────────
const goOnline = async (req, res, next) => {
  try {
    const { latitude, longitude, heading } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Location (latitude, longitude) is required to go online",
      });
    }

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });
    }

    if (driver.application_status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Driver application not yet approved",
      });
    }

    driver.is_online = true;
    driver.status = "active";
    driver.current_location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
    if (heading !== undefined) driver.heading = heading;
    driver.last_online_at = new Date();
    await driver.save();

    // Broadcast to all connected clients that a new driver is online
    try {
      const io = getIO();
      const user = await User.findById(req.user._id).select(
        "name profile_picture",
      );
      io.emit("driver-online", {
        driver_id: driver._id,
        user_id: req.user._id,
        name: user?.name,
        profile_picture: user?.profile_picture,
        vehicle_model: driver.vehicle_model,
        vehicle_color: driver.vehicle_color,
        plate_number: driver.plate_number,
        rating: driver.rating,
        available_seats: driver.available_seats,
        location: { latitude, longitude },
        heading: driver.heading,
      });
    } catch (err) {
      console.log("Socket emit failed (non-critical):", err.message);
    }

    res.status(200).json({
      success: true,
      message: "You are now online and available for rides",
      data: {
        is_online: driver.is_online,
        current_location: driver.current_location,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Go Offline ─────────────────────────────────────────────────────────────
const goOffline = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });
    }

    // Save last known location before going offline
    if (
      driver.current_location &&
      driver.current_location.coordinates &&
      driver.current_location.coordinates.length === 2
    ) {
      driver.last_known_location = {
        type: "Point",
        coordinates: driver.current_location.coordinates,
        address: req.body.address || "",
      };
    }

    driver.is_online = false;
    driver.status = "inactive";
    driver.last_online_at = new Date();
    await driver.save();

    // Broadcast driver went offline
    try {
      const io = getIO();
      io.emit("driver-offline", {
        driver_id: driver._id,
        user_id: req.user._id,
        last_known_location: driver.last_known_location,
      });
    } catch (err) {
      console.log("Socket emit failed (non-critical):", err.message);
    }

    res.status(200).json({
      success: true,
      message: "You are now offline",
      data: {
        is_online: driver.is_online,
        last_known_location: driver.last_known_location,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update Driver Live Location ────────────────────────────────────────────
const updateDriverLiveLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, heading } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Location (latitude, longitude) is required",
      });
    }

    const driver = await Driver.findOne({ user_id: req.user._id });
    if (!driver || !driver.is_online) {
      return res.status(400).json({
        success: false,
        message: "Driver must be online to update location",
      });
    }

    driver.current_location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
    if (heading !== undefined) driver.heading = heading;
    driver.last_online_at = new Date();
    await driver.save();

    // Broadcast real-time location to all connected clients
    try {
      const io = getIO();
      io.emit("driver-location-updated", {
        driver_id: driver._id,
        user_id: req.user._id,
        location: { latitude, longitude },
        heading: driver.heading,
        timestamp: new Date(),
      });
    } catch (err) {
      // Non-critical
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ─── Get Online Drivers (for user map and admin) ────────────────────────────
const getOnlineDrivers = async (req, res, next) => {
  try {
    const { latitude, longitude, radius } = req.query;

    let query = { is_online: true, application_status: "approved" };

    // Optional: filter by proximity
    if (latitude && longitude && radius) {
      query["current_location"] = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius) || 10000, // default 10km
        },
      };
    }

    const drivers = await Driver.find(query)
      .populate("user_id", "name profile_picture email")
      .select(
        "user_id vehicle_model vehicle_color plate_number available_seats rating total_ratings current_location heading last_online_at is_online",
      )
      .lean();

    const formattedDrivers = drivers.map((d) => ({
      driver_id: d._id,
      user_id: d.user_id?._id,
      name: d.user_id?.name,
      profile_picture: d.user_id?.profile_picture,
      email: d.user_id?.email,
      vehicle_model: d.vehicle_model,
      vehicle_color: d.vehicle_color,
      plate_number: d.plate_number,
      available_seats: d.available_seats,
      rating: d.rating,
      total_ratings: d.total_ratings,
      heading: d.heading,
      is_online: d.is_online,
      location: d.current_location?.coordinates
        ? {
            longitude: d.current_location.coordinates[0],
            latitude: d.current_location.coordinates[1],
          }
        : null,
      last_online_at: d.last_online_at,
    }));

    res.status(200).json({
      success: true,
      count: formattedDrivers.length,
      data: formattedDrivers,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get All Driver Locations (for admin map - includes offline with last known) ─
const getDriverLocations = async (req, res, next) => {
  try {
    const drivers = await Driver.find({
      application_status: "approved",
      $or: [
        { is_online: true },
        { "last_known_location.coordinates": { $exists: true, $ne: [] } },
      ],
    })
      .populate("user_id", "name profile_picture email")
      .select(
        "user_id vehicle_model vehicle_color plate_number available_seats rating current_location last_known_location heading last_online_at is_online status",
      )
      .lean();

    const formattedDrivers = drivers.map((d) => {
      const loc = d.is_online ? d.current_location : d.last_known_location;
      return {
        driver_id: d._id,
        user_id: d.user_id?._id,
        name: d.user_id?.name,
        profile_picture: d.user_id?.profile_picture,
        email: d.user_id?.email,
        vehicle_model: d.vehicle_model,
        vehicle_color: d.vehicle_color,
        plate_number: d.plate_number,
        available_seats: d.available_seats,
        rating: d.rating,
        heading: d.heading,
        is_online: d.is_online,
        status: d.status,
        location: loc?.coordinates
          ? { longitude: loc.coordinates[0], latitude: loc.coordinates[1] }
          : null,
        last_online_at: d.last_online_at,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedDrivers.length,
      data: formattedDrivers,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update User Location ────────────────────────────────────────────────────
const updateUserLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Location (latitude, longitude) is required",
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      current_location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    });

    res.status(200).json({ success: true, message: "Location updated" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyAsDriver,
  checkApplicationByEmail,
  getApplicationStatus,
  getDriverProfile,
  updateDriverProfile,
  toggleDriverStatus,
  updateDriverLicense,
  updateVehicleImage,
  verifyBankAccount,
  getBankList,
  goOnline,
  goOffline,
  updateDriverLiveLocation,
  getOnlineDrivers,
  getDriverLocations,
  updateUserLocation,
};
