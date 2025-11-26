const Admin = require('../models/Admin');
const College = require('../models/College');
const Department = require('../models/Department');
const Application = require('../models/Application');
const Driver = require('../models/Driver');
const Student = require('../models/Student');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const appConfig = require('../config/appConfig');
const { sendDriverApprovalEmail, sendDriverRejectionEmail } = require('../services/emailService');
const { logAdminAction } = require('../services/auditService');
const { getCachedAdminOverview, cacheAdminOverview } = require('../services/cacheService');
const logger = require('../config/logger');

/**
 * Create college
 */
exports.createCollege = async (req, res) => {
  try {
    const { name, code } = req.body;
    const adminId = req.user._id;

    const college = await College.create({
      name,
      code,
      created_by: adminId,
    });

    await logAdminAction.createCollege(adminId, college._id, { name, code }, req);

    logger.info(`College created: ${name} by admin ${adminId}`);

    res.status(201).json({
      success: true,
      message: 'College created successfully',
      college,
    });
  } catch (error) {
    logger.error(`Create college error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.code === 11000 ? 'College name already exists' : 'Failed to create college',
    });
  }
};

/**
 * Create department
 */
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, college_id } = req.body;
    const adminId = req.user._id;

    // Verify college exists
    const college = await College.findById(college_id);
    if (!college) {
      return res.status(404).json({
        success: false,
        error: 'College not found',
      });
    }

    const department = await Department.create({
      name,
      code,
      college_id,
      created_by: adminId,
    });

    await logAdminAction.createDepartment(adminId, department._id, { name, code, college_id }, req);

    logger.info(`Department created: ${name} by admin ${adminId}`);

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department,
    });
  } catch (error) {
    logger.error(`Create department error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.code === 11000 ? 'Department already exists in this college' : 'Failed to create department',
    });
  }
};

/**
 * Create admin
 */
exports.createAdmin = async (req, res) => {
  try {
    const { first_name, last_name, email, password, role } = req.body;
    const creatorId = req.user._id;

    // Only super_admin can create admins
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admins can create other admins',
      });
    }

    const admin = await Admin.create({
      first_name,
      last_name,
      email,
      password,
      role: role || 'admin',
    });

    logger.info(`Admin created: ${email} by super admin ${creatorId}`);

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        first_name: admin.first_name,
        last_name: admin.last_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    logger.error(`Create admin error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.code === 11000 ? 'Email already exists' : 'Failed to create admin',
    });
  }
};

/**
 * Get pending driver applications
 */
exports.getPendingApplications = async (req, res) => {
  try {
    const applications = await Application.find({ status: 'pending' })
      .sort({ submitted_at: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: applications.length,
      applications,
    });
  } catch (error) {
    logger.error(`Get pending applications error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications',
    });
  }
};

/**
 * Approve driver application
 */
exports.approveDriver = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const adminId = req.user._id;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Application already processed',
      });
    }

    // Generate default password (driver's first name or custom logic)
    const defaultPassword = appConfig.defaults.driverPasswordUseFirstname
      ? application.name.split(' ')[0]
      : 'Driver@123';

    // Create driver account
    const driver = await Driver.create({
      name: application.name,
      email: application.email,
      password: defaultPassword,
      phone: application.phone,
      vehicle_model: application.vehicle_model,
      plate_number: application.plate_number,
      drivers_license_url: application.drivers_license_url,
      application_status: 'approved',
      approved_by: adminId,
      approval_date: new Date(),
      first_login: true,
      status: 'inactive', // Active after password change
    });

    // Update application
    application.status = 'approved';
    application.reviewed_by = adminId;
    application.reviewed_at = new Date();
    await application.save();

    // Send approval email with credentials
    await sendDriverApprovalEmail(driver.email, driver.name, defaultPassword);

    await logAdminAction.approveDriver(adminId, driver._id, { name: driver.name, email: driver.email }, req);

    logger.info(`Driver approved: ${driver.email} by admin ${adminId}`);

    res.status(200).json({
      success: true,
      message: 'Driver application approved. Credentials sent via email.',
      driver: {
        id: driver._id,
        name: driver.name,
        email: driver.email,
      },
    });
  } catch (error) {
    logger.error(`Approve driver error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to approve application',
    });
  }
};

/**
 * Reject driver application
 */
exports.rejectDriver = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { rejection_reason } = req.body;
    const adminId = req.user._id;

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Application already processed',
      });
    }

    application.status = 'rejected';
    application.reviewed_by = adminId;
    application.reviewed_at = new Date();
    application.rejection_reason = rejection_reason || 'Application does not meet requirements';
    await application.save();

    // Send rejection email
    await sendDriverRejectionEmail(application.email, application.name, application.rejection_reason);

    await logAdminAction.rejectDriver(adminId, application._id, { email: application.email, reason: rejection_reason }, req);

    logger.info(`Driver application rejected: ${application.email} by admin ${adminId}`);

    res.status(200).json({
      success: true,
      message: 'Driver application rejected',
    });
  } catch (error) {
    logger.error(`Reject driver error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to reject application',
    });
  }
};

/**
 * Update fare policy
 */
exports.updateFarePolicy = async (req, res) => {
  try {
    const { mode, base_fee, per_meter_rate, default_fare } = req.body;
    const adminId = req.user._id;

    // Validate mode
    if (!['admin', 'driver', 'distance_auto'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid fare policy mode',
      });
    }

    // Update environment variables (in production, store in database)
    process.env.FARE_POLICY_MODE = mode;
    if (base_fee) process.env.FARE_BASE_FEE = base_fee.toString();
    if (per_meter_rate) process.env.FARE_PER_METER_RATE = per_meter_rate.toString();
    if (default_fare) process.env.DEFAULT_FARE = default_fare.toString();

    // Reload config
    appConfig.farePolicy.mode = mode;
    if (base_fee) appConfig.farePolicy.baseFee = parseFloat(base_fee);
    if (per_meter_rate) appConfig.farePolicy.perMeterRate = parseFloat(per_meter_rate);
    if (default_fare) appConfig.farePolicy.defaultFare = parseFloat(default_fare);

    await logAdminAction.updateFarePolicy(adminId, { mode, base_fee, per_meter_rate, default_fare }, req);

    logger.info(`Fare policy updated to ${mode} by admin ${adminId}`);

    res.status(200).json({
      success: true,
      message: 'Fare policy updated successfully',
      farePolicy: appConfig.farePolicy,
    });
  } catch (error) {
    logger.error(`Update fare policy error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update fare policy',
    });
  }
};

/**
 * Get admin overview/dashboard data
 */
exports.getOverview = async (req, res) => {
  try {
    // Check cache first
    const cached = await getCachedAdminOverview();
    if (cached) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cached,
      });
    }

    // Fetch fresh data
    const [
      totalStudents,
      totalDrivers,
      activeDrivers,
      totalRides,
      activeRides,
      totalBookings,
      pendingApplications,
      flaggedStudents,
    ] = await Promise.all([
      Student.countDocuments(),
      Driver.countDocuments(),
      Driver.countDocuments({ status: 'active' }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: { $in: ['available', 'in_progress'] } }),
      Booking.countDocuments(),
      Application.countDocuments({ status: 'pending' }),
      Student.countDocuments({ is_flagged: true }),
    ]);

    const overview = {
      totalStudents,
      totalDrivers,
      activeDrivers,
      totalRides,
      activeRides,
      totalBookings,
      pendingApplications,
      flaggedStudents,
      farePolicy: appConfig.farePolicy,
    };

    // Cache the result
    await cacheAdminOverview(overview);

    res.status(200).json({
      success: true,
      cached: false,
      data: overview,
    });
  } catch (error) {
    logger.error(`Get overview error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overview',
    });
  }
};

/**
 * Release device binding for student
 */
exports.releaseDeviceBinding = async (req, res) => {
  try {
    const { studentId } = req.params;
    const adminId = req.user._id;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
      });
    }

    const oldDeviceId = student.device_id;
    student.device_id = null;
    await student.save();

    logger.info(`Device binding released for student ${student.matric_no} by admin ${adminId}`);

    res.status(200).json({
      success: true,
      message: 'Device binding released successfully',
    });
  } catch (error) {
    logger.error(`Release device binding error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to release device binding',
    });
  }
};
