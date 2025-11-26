const jwt = require('jsonwebtoken');
const appConfig = require('../config/appConfig');
const logger = require('../config/logger');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Driver = require('../models/Driver');

/**
 * Protect routes - verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized. No token provided.',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, appConfig.jwt.secret);

      // Attach user to request based on user type
      if (decoded.userType === 'admin') {
        req.user = await Admin.findById(decoded.id).select('-password');
        req.userType = 'admin';
      } else if (decoded.userType === 'student') {
        req.user = await Student.findById(decoded.id).select('-password');
        req.userType = 'student';
      } else if (decoded.userType === 'driver') {
        req.user = await Driver.findById(decoded.id).select('-password');
        req.userType = 'driver';
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not found.',
        });
      }

      next();
    } catch (error) {
      logger.error(`JWT verification error: ${error.message}`);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please login again.',
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Invalid token. Not authorized.',
      });
    }
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server error in authentication.',
    });
  }
};

/**
 * Generate JWT token
 */
const generateToken = (id, userType) => {
  return jwt.sign({ id, userType }, appConfig.jwt.secret, {
    expiresIn: appConfig.jwt.expire,
  });
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (id, userType) => {
  return jwt.sign({ id, userType }, appConfig.jwt.refreshSecret, {
    expiresIn: appConfig.jwt.refreshExpire,
  });
};

module.exports = {
  protect,
  generateToken,
  generateRefreshToken,
};
