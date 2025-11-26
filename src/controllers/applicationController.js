const Application = require('../models/Application');
const Driver = require('../models/Driver');
const { getPaginationParams, createPaginationResponse } = require('../utils/pagination');
const logger = require('../config/logger');

/**
 * Get all applications with pagination
 * Admin only
 */
exports.getAllApplications = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit, skip } = getPaginationParams(req);

    const query = {};
    if (status) {
      query.status = status;
    }

    const applications = await Application.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Application.countDocuments(query);

    res.status(200).json({
      success: true,
      ...createPaginationResponse(applications, total, page, limit),
    });
  } catch (error) {
    logger.error(`Get applications error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications',
    });
  }
};

/**
 * Get application by ID
 */
exports.getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await Application.findById(id).lean();

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    res.status(200).json({
      success: true,
      application,
    });
  } catch (error) {
    logger.error(`Get application error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application',
    });
  }
};

module.exports = exports;
