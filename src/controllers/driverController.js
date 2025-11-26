const Driver = require('../models/Driver');
const Application = require('../models/Application');
const Ride = require('../models/Ride');
const { sendDriverApplicationReceivedEmail } = require('../services/emailService');
const { logDriverAction } = require('../services/auditService');
const { validateBankAccountNumber } = require('../utils/validators');
const logger = require('../config/logger');

/**
 * Submit driver application
 */
exports.submitApplication = async (req, res) => {
  try {
    const { name, email, phone, vehicle_model, plate_number, drivers_license_url } = req.body;

    // Check if email already exists
    const existingApplication = await Application.findOne({ email: email.toLowerCase() });
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        error: 'Application already submitted with this email',
      });
    }

    const existingDriver = await Driver.findOne({ email: email.toLowerCase() });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        error: 'Driver account already exists with this email',
      });
    }

    // Create application
    const application = await Application.create({
      name,
      email: email.toLowerCase(),
      phone,
      vehicle_model,
      plate_number: plate_number?.toUpperCase(),
      drivers_license_url,
      status: 'pending',
      submitted_at: new Date(),
    });

    // Send confirmation email
    await sendDriverApplicationReceivedEmail(email, name);

    await logDriverAction.submitApplication(email, application._id, { name, email }, req);

    logger.info(`Driver application submitted: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully. You will be notified via email once reviewed.',
      application: {
        id: application._id,
        status: application.status,
        submitted_at: application.submitted_at,
      },
    });
  } catch (error) {
    logger.error(`Submit application error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to submit application',
    });
  }
};

/**
 * Get driver application/account status
 */
exports.getStatus = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    // Check application
    const application = await Application.findOne({ email: email.toLowerCase() }).lean();

    if (application) {
      return res.status(200).json({
        success: true,
        type: 'application',
        status: application.status,
        submitted_at: application.submitted_at,
        reviewed_at: application.reviewed_at,
        rejection_reason: application.rejection_reason,
      });
    }

    // Check driver account
    const driver = await Driver.findOne({ email: email.toLowerCase() }).select('-password').lean();

    if (driver) {
      return res.status(200).json({
        success: true,
        type: 'driver',
        status: driver.status,
        first_login: driver.first_login,
        approved_date: driver.approval_date,
      });
    }

    res.status(404).json({
      success: false,
      error: 'No application or account found with this email',
    });
  } catch (error) {
    logger.error(`Get status error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status',
    });
  }
};

/**
 * Update driver profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { phone, vehicle_model, plate_number, available_seats } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Driver not found',
      });
    }

    // Update fields
    if (phone) driver.phone = phone;
    if (vehicle_model) driver.vehicle_model = vehicle_model;
    if (plate_number) driver.plate_number = plate_number.toUpperCase();
    if (available_seats) driver.available_seats = available_seats;

    await driver.save();

    logger.info(`Driver profile updated: ${driverId}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      driver: {
        phone: driver.phone,
        vehicle_model: driver.vehicle_model,
        plate_number: driver.plate_number,
        available_seats: driver.available_seats,
      },
    });
  } catch (error) {
    logger.error(`Update driver profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
};

/**
 * Add/update bank details
 */
exports.updateBankDetails = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { bank_name, bank_account_number, bank_account_name } = req.body;

    if (!bank_name || !bank_account_number) {
      return res.status(400).json({
        success: false,
        error: 'Bank name and account number are required',
      });
    }

    // Validate account number
    if (!validateBankAccountNumber(bank_account_number)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bank account number format',
      });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Driver not found',
      });
    }

    driver.bank_name = bank_name;
    driver.bank_account_number = bank_account_number;
    if (bank_account_name) {
      driver.bank_account_name = bank_account_name;
    }

    await driver.save();

    await logDriverAction.updateBankDetails(driverId, { bank_name }, req);

    logger.info(`Bank details updated for driver: ${driverId}`);

    res.status(200).json({
      success: true,
      message: 'Bank details updated successfully',
      bank_details: {
        bank_name: driver.bank_name,
        bank_account_number: driver.bank_account_number,
        bank_account_name: driver.bank_account_name,
      },
    });
  } catch (error) {
    logger.error(`Update bank details error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update bank details',
    });
  }
};

/**
 * Get driver profile
 */
exports.getProfile = async (req, res) => {
  try {
    const driver = await Driver.findById(req.user._id).select('-password').lean();

    // Get ride statistics
    const totalRides = await Ride.countDocuments({ driver_id: driver._id, status: 'completed' });
    const activeRides = await Ride.countDocuments({ driver_id: driver._id, status: { $in: ['available', 'in_progress'] } });

    res.status(200).json({
      success: true,
      driver: {
        ...driver,
        statistics: {
          total_rides: totalRides,
          active_rides: activeRides,
        },
      },
    });
  } catch (error) {
    logger.error(`Get driver profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
};

/**
 * Update driver location
 */
exports.updateLocation = async (req, res) => {
  try {
    const driverId = req.user._id;
    const { longitude, latitude } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Driver not found',
      });
    }

    driver.updateLocation(longitude, latitude);
    await driver.save();

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
    });
  } catch (error) {
    logger.error(`Update driver location error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update location',
    });
  }
};

module.exports = exports;
