const logger = require('../config/logger');
const Student = require('../models/Student');
const appConfig = require('../config/appConfig');

/**
 * Device lock middleware - enforce single device per student
 */
const deviceLockMiddleware = async (req, res, next) => {
  try {
    // Only apply to students
    if (req.userType !== 'student') {
      return next();
    }

    const deviceId = req.headers['x-device-id'] || req.body.device_id;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required.',
      });
    }

    const student = req.user;

    // If device_id is not set, bind this device
    if (!student.device_id) {
      student.device_id = deviceId;
      await student.save();
      logger.info(`Device ${deviceId} bound to student ${student.matric_no}`);
      return next();
    }

    // If device_id matches, allow
    if (student.device_id === deviceId) {
      return next();
    }

    // Device mismatch - not allowed
    logger.warn(`Device mismatch for student ${student.matric_no}. Expected: ${student.device_id}, Got: ${deviceId}`);
    return res.status(403).json({
      success: false,
      error: 'This account is bound to another device. Contact admin to reset.',
      code: 'DEVICE_MISMATCH',
    });
  } catch (error) {
    logger.error(`Device lock middleware error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server error in device lock verification.',
    });
  }
};

/**
 * Validate device ID on login before token generation
 */
const validateDeviceOnLogin = async (student, deviceId) => {
  try {
    // If no device bound, bind this device
    if (!student.device_id) {
      student.device_id = deviceId;
      await student.save();
      return { success: true, message: 'Device bound successfully.' };
    }

    // If device matches, allow
    if (student.device_id === deviceId) {
      return { success: true, message: 'Device verified.' };
    }

    // Device mismatch
    return {
      success: false,
      message: 'This account is bound to another device. Contact admin to reset.',
      code: 'DEVICE_MISMATCH',
    };
  } catch (error) {
    logger.error(`Validate device on login error: ${error.message}`);
    return {
      success: false,
      message: 'Error validating device.',
    };
  }
};

/**
 * Admin can release device binding
 */
const releaseDeviceBinding = async (studentId) => {
  try {
    const student = await Student.findById(studentId);
    
    if (!student) {
      return { success: false, message: 'Student not found.' };
    }

    student.device_id = null;
    await student.save();

    logger.info(`Device binding released for student ${student.matric_no}`);
    return { success: true, message: 'Device binding released successfully.' };
  } catch (error) {
    logger.error(`Release device binding error: ${error.message}`);
    return { success: false, message: 'Error releasing device binding.' };
  }
};

module.exports = {
  deviceLockMiddleware,
  validateDeviceOnLogin,
  releaseDeviceBinding,
};
