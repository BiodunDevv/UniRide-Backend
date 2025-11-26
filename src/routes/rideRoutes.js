const express = require('express');
const router = express.Router();
const rideController = require('../controllers/rideController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { validateCreateRide, validateUpdateLocation } = require('../middlewares/validateMiddleware');

/**
 * @swagger
 * /api/rides:
 *   post:
 *     summary: Create a new ride (driver only)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pickup_location:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                   address:
 *                     type: string
 *               destination:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                   address:
 *                     type: string
 *               fare:
 *                 type: number
 *               departure_time:
 *                 type: string
 *                 format: date-time
 *               available_seats:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ride created successfully
 */
router.post('/', protect, authorize('driver'), validateCreateRide, rideController.createRide);

/**
 * @swagger
 * /api/rides/nearby:
 *   get:
 *     summary: Get nearby available rides
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: max_distance
 *         schema:
 *           type: number
 *           description: Max distance in kilometers
 *     responses:
 *       200:
 *         description: Nearby rides retrieved
 */
router.get('/nearby', protect, rideController.getNearbyRides);

/**
 * @swagger
 * /api/rides/active:
 *   get:
 *     summary: Get active rides for current user
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active rides retrieved
 */
router.get('/active', protect, rideController.getActiveRides);

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get ride details by ID
 *     tags: [Rides]
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
 *         description: Ride details retrieved
 */
router.get('/:id', protect, rideController.getRideById);

/**
 * @swagger
 * /api/rides/{id}/check-in-code:
 *   post:
 *     summary: Generate/rotate check-in code (driver only)
 *     tags: [Rides]
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
 *         description: Check-in code generated
 */
router.post('/:id/check-in-code', protect, authorize('driver'), rideController.generateCheckInCode);

/**
 * @swagger
 * /api/rides/{id}/start:
 *   post:
 *     summary: Start ride (driver only)
 *     tags: [Rides]
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
 *         description: Ride started successfully
 */
router.post('/:id/start', protect, authorize('driver'), rideController.startRide);

/**
 * @swagger
 * /api/rides/{id}/location:
 *   put:
 *     summary: Update driver location during ride
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               longitude:
 *                 type: number
 *               latitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.put('/:id/location', protect, authorize('driver'), validateUpdateLocation, rideController.updateLocation);

/**
 * @swagger
 * /api/rides/{id}/end:
 *   post:
 *     summary: End ride (driver only)
 *     tags: [Rides]
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
 *         description: Ride ended successfully
 */
router.post('/:id/end', protect, authorize('driver'), rideController.endRide);

module.exports = router;
