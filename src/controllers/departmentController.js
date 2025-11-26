const Department = require('../models/Department');
const College = require('../models/College');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * Get all departments
 */
exports.getAllDepartments = async (req, res) => {
  try {
    const { page, limit, sort } = getPaginationParams(req.query);
    const { college_id } = req.query;

    const filter = college_id ? { college_id } : {};

    const departments = await Department.find(filter)
      .populate('college_id', 'name code')
      .populate('created_by', 'first_name last_name email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Department.countDocuments(filter);

    res.status(200).json(createPaginationResponse(departments, total, page, limit));
  } catch (error) {
    logger.error(`Get all departments error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments',
    });
  }
};

/**
 * Get department by ID
 */
exports.getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id)
      .populate('college_id', 'name code')
      .populate('created_by', 'first_name last_name email')
      .lean();

    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found',
      });
    }

    res.status(200).json({
      success: true,
      department,
    });
  } catch (error) {
    logger.error(`Get department by ID error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch department',
    });
  }
};

module.exports = exports;
