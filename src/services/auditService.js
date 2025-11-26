const mongoose = require('mongoose');
const logger = require('../config/logger');

/**
 * Audit Log Schema
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'admin_create_college',
        'admin_create_department',
        'admin_create_admin',
        'admin_approve_driver',
        'admin_reject_driver',
        'admin_update_fare_policy',
        'admin_release_device',
        'admin_flag_user',
        'admin_unflag_user',
        'student_upload',
        'driver_application_submit',
        'driver_bank_details_update',
        'ride_create',
        'ride_start',
        'ride_complete',
        'ride_cancel',
        'booking_create',
        'booking_cancel',
        'check_in',
        'other',
      ],
    },
    performed_by: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'performed_by_model',
      required: true,
    },
    performed_by_model: {
      type: String,
      required: true,
      enum: ['Admin', 'Student', 'Driver'],
    },
    target_model: {
      type: String,
      enum: ['Admin', 'Student', 'Driver', 'Ride', 'Booking', 'Application', 'College', 'Department', null],
    },
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ip_address: {
      type: String,
    },
    user_agent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

// Indexes
auditLogSchema.index({ action: 1, created_at: -1 });
auditLogSchema.index({ performed_by: 1, created_at: -1 });
auditLogSchema.index({ created_at: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/**
 * Log an action
 * @param {object} options - Audit log options
 */
const logAction = async (options) => {
  try {
    const {
      action,
      performedBy,
      performedByModel,
      targetModel = null,
      targetId = null,
      details = {},
      ipAddress = null,
      userAgent = null,
    } = options;

    const auditLog = new AuditLog({
      action,
      performed_by: performedBy,
      performed_by_model: performedByModel,
      target_model: targetModel,
      target_id: targetId,
      details,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    await auditLog.save();
    logger.info(`Audit log created: ${action} by ${performedByModel} ${performedBy}`);
    
    return auditLog;
  } catch (error) {
    logger.error(`Error creating audit log: ${error.message}`);
    // Don't throw - audit logging should not break the main flow
  }
};

/**
 * Get audit logs with filters
 * @param {object} filters - Query filters
 * @param {object} options - Pagination options
 */
const getAuditLogs = async (filters = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const logs = await AuditLog.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('performed_by', 'first_name last_name email matric_no name')
      .lean();

    const total = await AuditLog.countDocuments(filters);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error(`Error getting audit logs: ${error.message}`);
    throw error;
  }
};

/**
 * Admin action loggers (convenience functions)
 */
const logAdminAction = {
  createCollege: (adminId, collegeId, details, req) =>
    logAction({
      action: 'admin_create_college',
      performedBy: adminId,
      performedByModel: 'Admin',
      targetModel: 'College',
      targetId: collegeId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  createDepartment: (adminId, departmentId, details, req) =>
    logAction({
      action: 'admin_create_department',
      performedBy: adminId,
      performedByModel: 'Admin',
      targetModel: 'Department',
      targetId: departmentId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  approveDriver: (adminId, driverId, details, req) =>
    logAction({
      action: 'admin_approve_driver',
      performedBy: adminId,
      performedByModel: 'Admin',
      targetModel: 'Driver',
      targetId: driverId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  rejectDriver: (adminId, applicationId, details, req) =>
    logAction({
      action: 'admin_reject_driver',
      performedBy: adminId,
      performedByModel: 'Admin',
      targetModel: 'Application',
      targetId: applicationId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  updateFarePolicy: (adminId, details, req) =>
    logAction({
      action: 'admin_update_fare_policy',
      performedBy: adminId,
      performedByModel: 'Admin',
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  uploadStudents: (adminId, details, req) =>
    logAction({
      action: 'student_upload',
      performedBy: adminId,
      performedByModel: 'Admin',
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),
};

/**
 * Driver action loggers
 */
const logDriverAction = {
  submitApplication: (email, applicationId, details, req) =>
    logAction({
      action: 'driver_application_submit',
      performedBy: applicationId,
      performedByModel: 'Driver',
      targetModel: 'Application',
      targetId: applicationId,
      details: { ...details, email },
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  updateBankDetails: (driverId, details, req) =>
    logAction({
      action: 'driver_bank_details_update',
      performedBy: driverId,
      performedByModel: 'Driver',
      targetModel: 'Driver',
      targetId: driverId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  createRide: (driverId, rideId, details, req) =>
    logAction({
      action: 'ride_create',
      performedBy: driverId,
      performedByModel: 'Driver',
      targetModel: 'Ride',
      targetId: rideId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),
};

/**
 * Student action loggers
 */
const logStudentAction = {
  createBooking: (studentId, bookingId, details, req) =>
    logAction({
      action: 'booking_create',
      performedBy: studentId,
      performedByModel: 'Student',
      targetModel: 'Booking',
      targetId: bookingId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),

  checkIn: (studentId, bookingId, details, req) =>
    logAction({
      action: 'check_in',
      performedBy: studentId,
      performedByModel: 'Student',
      targetModel: 'Booking',
      targetId: bookingId,
      details,
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent'),
    }),
};

module.exports = {
  logAction,
  getAuditLogs,
  logAdminAction,
  logDriverAction,
  logStudentAction,
  AuditLog,
};
