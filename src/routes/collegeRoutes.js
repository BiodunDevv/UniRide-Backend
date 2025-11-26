const express = require('express');
const router = express.Router();
const collegeController = require('../controllers/collegeController');
const { protect } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/colleges:
 *   get:
 *     summary: Get all colleges
 *     tags: [Colleges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Colleges retrieved successfully
 */
router.get('/', protect, collegeController.getAllColleges);

/**
 * @swagger
 * /api/colleges/{id}:
 *   get:
 *     summary: Get college by ID
 *     tags: [Colleges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: College details retrieved
 */
router.get('/:id', protect, collegeController.getCollegeById);

/**
 * @swagger
 * /api/colleges/{id}/departments:
 *   get:
 *     summary: Get all departments in a college
 *     tags: [Colleges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Departments retrieved successfully
 */
router.get('/:id/departments', protect, collegeController.getDepartmentsByCollege);

module.exports = router;
