const Student = require('../models/Student');
const College = require('../models/College');
const Department = require('../models/Department');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const appConfig = require('../config/appConfig');
const { logAdminAction } = require('../services/auditService');
const { validateLevel } = require('../utils/validators');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * Upload students from CSV/Excel file
 */
exports.uploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const adminId = req.user._id;
    const filePath = req.file.path;
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

    let students = [];

    // Parse CSV or Excel
    if (fileExtension === 'csv') {
      students = await parseCSV(filePath);
    } else if (['xlsx', 'xls'].includes(fileExtension)) {
      students = parseExcel(filePath);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid file format. Please upload CSV or Excel file',
      });
    }

    // Validate and process students
    const results = {
      success: [],
      failed: [],
    };

    for (const studentData of students) {
      try {
        // Validate required fields
        if (!studentData.matric_no || !studentData.email || !studentData.first_name || !studentData.last_name) {
          results.failed.push({
            data: studentData,
            error: 'Missing required fields',
          });
          continue;
        }

        // Validate level
        if (!validateLevel(parseInt(studentData.level))) {
          results.failed.push({
            data: studentData,
            error: 'Invalid level. Must be 100, 200, 300, 400, 500, or 600',
          });
          continue;
        }

        // Find college and department
        const college = await College.findOne({
          $or: [{ code: studentData.college_code }, { name: studentData.college_name }],
        });

        if (!college) {
          results.failed.push({
            data: studentData,
            error: 'College not found',
          });
          continue;
        }

        const department = await Department.findOne({
          college_id: college._id,
          $or: [{ code: studentData.department_code }, { name: studentData.department_name }],
        });

        if (!department) {
          results.failed.push({
            data: studentData,
            error: 'Department not found',
          });
          continue;
        }

        // Create student
        const student = await Student.create({
          matric_no: studentData.matric_no.toUpperCase(),
          first_name: studentData.first_name,
          last_name: studentData.last_name,
          email: studentData.email.toLowerCase(),
          college_id: college._id,
          department_id: department._id,
          level: parseInt(studentData.level),
          password: appConfig.defaults.studentPassword,
          first_login: true,
        });

        results.success.push({
          matric_no: student.matric_no,
          email: student.email,
        });
      } catch (error) {
        results.failed.push({
          data: studentData,
          error: error.message,
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    await logAdminAction.uploadStudents(adminId, {
      total: students.length,
      success: results.success.length,
      failed: results.failed.length,
    }, req);

    logger.info(`Students uploaded: ${results.success.length} success, ${results.failed.length} failed by admin ${adminId}`);

    res.status(200).json({
      success: true,
      message: 'Student upload completed',
      results,
    });
  } catch (error) {
    logger.error(`Upload students error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to upload students',
    });
  }
};

/**
 * Get student profile
 */
exports.getProfile = async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('college_id', 'name code')
      .populate('department_id', 'name code')
      .lean();

    res.status(200).json({
      success: true,
      student,
    });
  } catch (error) {
    logger.error(`Get student profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
};

/**
 * Get student ride history
 */
exports.getRideHistory = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { page, limit, sort } = getPaginationParams(req.query);

    const bookings = await Booking.find({ student_id: studentId })
      .populate({
        path: 'ride_id',
        populate: { path: 'driver_id', select: 'name email phone rating' },
      })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Booking.countDocuments({ student_id: studentId });

    res.status(200).json(createPaginationResponse(bookings, total, page, limit));
  } catch (error) {
    logger.error(`Get ride history error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ride history',
    });
  }
};

/**
 * Update student profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { biometric_enabled } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
      });
    }

    if (typeof biometric_enabled === 'boolean') {
      student.biometric_enabled = biometric_enabled;
    }

    await student.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      student: {
        biometric_enabled: student.biometric_enabled,
      },
    });
  } catch (error) {
    logger.error(`Update student profile error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
};

/**
 * Helper: Parse CSV file
 */
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const students = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => students.push(row))
      .on('end', () => resolve(students))
      .on('error', reject);
  });
};

/**
 * Helper: Parse Excel file
 */
const parseExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

module.exports = exports;
