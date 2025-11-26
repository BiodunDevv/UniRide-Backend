const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const {
  validateCreateCollege,
  validateCreateDepartment,
  validateCreateAdmin,
  validateUpdateFarePolicy,
  validateReleaseDevice,
} = require('../middlewares/validateMiddleware');

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

/**
 * @swagger
 * /api/admin/colleges:
 *   post:
 *     summary: Create a new college
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       201:
 *         description: College created successfully
 */
router.post('/colleges', validateCreateCollege, adminController.createCollege);

/**
 * @swagger
 * /api/admin/departments:
 *   post:
 *     summary: Create a new department
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               college_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Department created successfully
 */
router.post('/departments', validateCreateDepartment, adminController.createDepartment);

/**
 * @swagger
 * /api/admin/admins:
 *   post:
 *     summary: Create a new admin (super_admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *     responses:
 *       201:
 *         description: Admin created successfully
 */
router.post('/admins', validateCreateAdmin, adminController.createAdmin);

/**
 * @swagger
 * /api/admin/applications/pending:
 *   get:
 *     summary: Get all pending driver applications
 *     tags: [Admin]
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
 *         description: Pending applications retrieved
 */
router.get('/applications/pending', adminController.getPendingApplications);

/**
 * @swagger
 * /api/admin/drivers/{applicationId}/approve:
 *   post:
 *     summary: Approve driver application
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver approved successfully
 */
router.post('/drivers/:applicationId/approve', adminController.approveDriver);

/**
 * @swagger
 * /api/admin/drivers/{applicationId}/reject:
 *   post:
 *     summary: Reject driver application
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver application rejected
 */
router.post('/drivers/:applicationId/reject', adminController.rejectDriver);

/**
 * @swagger
 * /api/admin/fare-policy:
 *   put:
 *     summary: Update fare policy settings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [admin, driver, distance_auto]
 *               base_fee:
 *                 type: number
 *               per_meter_rate:
 *                 type: number
 *     responses:
 *       200:
 *         description: Fare policy updated successfully
 */
router.put('/fare-policy', validateUpdateFarePolicy, adminController.updateFarePolicy);

/**
 * @swagger
 * /api/admin/overview:
 *   get:
 *     summary: Get admin dashboard overview
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overview statistics retrieved
 */
router.get('/overview', adminController.getOverview);

/**
 * @swagger
 * /api/admin/students/{studentId}/release-device:
 *   post:
 *     summary: Release student device binding
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device binding released
 */
router.post('/students/:studentId/release-device', validateReleaseDevice, adminController.releaseDeviceBinding);

module.exports = router;
