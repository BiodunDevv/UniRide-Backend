const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { validateUploadStudents, validateUpdateProfile } = require('../middlewares/validateMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

/**
 * @swagger
 * /api/students/upload:
 *   post:
 *     summary: Upload students from CSV/Excel file (admin only)
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Students uploaded successfully
 */
router.post(
  '/upload',
  protect,
  authorize('admin'),
  upload.single('file'),
  studentController.uploadStudents
);

/**
 * @swagger
 * /api/students/profile:
 *   get:
 *     summary: Get student profile
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get('/profile', protect, authorize('student'), studentController.getProfile);

/**
 * @swagger
 * /api/students/profile:
 *   put:
 *     summary: Update student profile
 *     tags: [Students]
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
 *               biometric_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/profile', protect, authorize('student'), validateUpdateProfile, studentController.updateProfile);

/**
 * @swagger
 * /api/students/ride-history:
 *   get:
 *     summary: Get student ride history
 *     tags: [Students]
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
 *         description: Ride history retrieved
 */
router.get('/ride-history', protect, authorize('student'), studentController.getRideHistory);

module.exports = router;
