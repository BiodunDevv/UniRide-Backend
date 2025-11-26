const logger = require('../config/logger');

/**
 * Authorize specific user roles
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'super_admin', 'student', 'driver')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user is attached to request
    if (!req.user || !req.userType) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized. Please login.',
      });
    }

    // For admin users, check their role
    if (req.userType === 'admin') {
      if (!roles.includes(req.user.role) && !roles.includes('admin')) {
        logger.warn(`Unauthorized access attempt by admin ${req.user.email} to role ${roles.join(', ')}`);
        return res.status(403).json({
          success: false,
          error: `User role '${req.user.role}' is not authorized to access this route.`,
        });
      }
    }
    // For other user types, check if their type is allowed
    else if (!roles.includes(req.userType)) {
      logger.warn(`Unauthorized access attempt by ${req.userType} ${req.user.email || req.user.matric_no}`);
      return res.status(403).json({
        success: false,
        error: `User type '${req.userType}' is not authorized to access this route.`,
      });
    }

    next();
  };
};

/**
 * Admin only middleware
 */
const adminOnly = authorize('admin', 'super_admin');

/**
 * Super admin only middleware
 */
const superAdminOnly = authorize('super_admin');

/**
 * Student only middleware
 */
const studentOnly = authorize('student');

/**
 * Driver only middleware
 */
const driverOnly = authorize('driver');

/**
 * Student or Driver middleware
 */
const studentOrDriver = authorize('student', 'driver');

module.exports = {
  authorize,
  adminOnly,
  superAdminOnly,
  studentOnly,
  driverOnly,
  studentOrDriver,
};
