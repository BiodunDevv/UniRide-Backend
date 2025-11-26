const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const {
  validateSubmitApplication,
  validateUpdateDriverProfile,
  validateUpdateBankDetails,
  validateUpdateLocation,
} = require('../middlewares/validateMiddleware');

/**
 * @swagger
 * /api/drivers/apply:
 *   post:
 *     summary: Submit driver application
 *     tags: [Drivers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               vehicle_model:
 *                 type: string
 *               plate_number:
 *                 type: string
 *               available_seats:
 *                 type: integer
 *               license_url:
 *                 type: string
 *               vehicle_document_url:
 *                 type: string
 *     responses:
 *       201:
 *         description: Application submitted successfully
 */
router.post('/apply', validateSubmitApplication, driverController.submitApplication);

/**
 * @swagger
 * /api/drivers/status:
 *   get:
 *     summary: Check application status by email
 *     tags: [Drivers]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 */
router.get('/status', driverController.getStatus);

/**
 * @swagger
 * /api/drivers/profile:
 *   get:
 *     summary: Get driver profile with statistics
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get('/profile', protect, authorize('driver'), driverController.getProfile);

/**
 * @swagger
 * /api/drivers/profile:
 *   put:
 *     summary: Update driver profile
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *               vehicle_model:
 *                 type: string
 *               plate_number:
 *                 type: string
 *               available_seats:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/profile', protect, authorize('driver'), validateUpdateDriverProfile, driverController.updateProfile);

/**
 * @swagger
 * /api/drivers/bank-details:
 *   put:
 *     summary: Update bank account details
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank_name:
 *                 type: string
 *               account_number:
 *                 type: string
 *               account_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bank details updated successfully
 */
router.put('/bank-details', protect, authorize('driver'), validateUpdateBankDetails, driverController.updateBankDetails);

/**
 * @swagger
 * /api/drivers/location:
 *   put:
 *     summary: Update current location
 *     tags: [Drivers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               longitude:
 *                 type: number
 *               latitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.put('/location', protect, authorize('driver'), validateUpdateLocation, driverController.updateLocation);

module.exports = router;
