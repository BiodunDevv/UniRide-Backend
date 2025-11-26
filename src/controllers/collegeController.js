const College = require('../models/College');
const Department = require('../models/Department');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * Get all colleges
 */
exports.getAllColleges = async (req, res) => {
  try {
    const { page, limit, sort } = getPaginationParams(req.query);

    const colleges = await College.find()
      .populate('created_by', 'first_name last_name email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await College.countDocuments();

    res.status(200).json(createPaginationResponse(colleges, total, page, limit));
  } catch (error) {
    logger.error(`Get all colleges error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch colleges',
    });
  }
};

/**
 * Get college by ID
 */
exports.getCollegeById = async (req, res) => {
  try {
    const { id } = req.params;

    const college = await College.findById(id)
      .populate('created_by', 'first_name last_name email')
      .lean();

    if (!college) {
      return res.status(404).json({
        success: false,
        error: 'College not found',
      });
    }

    res.status(200).json({
      success: true,
      college,
    });
  } catch (error) {
    logger.error(`Get college by ID error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch college',
    });
  }
};

/**
 * Get departments by college
 */
exports.getDepartmentsByCollege = async (req, res) => {
  try {
    const { id } = req.params;

    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({
        success: false,
        error: 'College not found',
      });
    }

    const departments = await Department.find({ college_id: id })
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      college: {
        id: college._id,
        name: college.name,
        code: college.code,
      },
      departments,
    });
  } catch (error) {
    logger.error(`Get departments by college error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments',
    });
  }
};

module.exports = exports;
