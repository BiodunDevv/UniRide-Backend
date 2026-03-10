const express = require("express");
const router = express.Router();
const {
  createRide,
  getActiveRides,
  getRideDetails,
  getAllRides,
  updateRide,
  cancelRide,
  updateDriverLocation,
  startRide,
  endRide,
  getMyRides,
  acceptRide,
  getAvailableRequests,
} = require("../controllers/rideController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   - name: Rides
 *     description: Ride management — create, browse, manage rides
 */

/**
 * @swagger
 * /api/rides:
 *   post:
 *     tags: [Rides]
 *     summary: Create a new ride
 *     description: Users create ride requests (no driver), drivers create scheduled rides, admins can assign a driver.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pickup_location_id, destination_id]
 *             properties:
 *               pickup_location_id: { type: string }
 *               destination_id: { type: string }
 *               fare: { type: number }
 *               departure_time: { type: string, format: date-time }
 *               available_seats: { type: integer, default: 4 }
 *               driver_id: { type: string, description: "Admin only — assign driver" }
 *               seats_requested: { type: integer, default: 1 }
 *               payment_method: { type: string, enum: [cash, transfer] }
 *     responses:
 *       201: { description: Ride created, content: { application/json: { schema: { type: object, properties: { success: { type: boolean }, data: { type: object, properties: { ride: { type: object }, booking: { type: object, nullable: true } } } } } } } }
 *       400: { description: Validation error }
 */
router.post("/", protect, apiLimiter, createRide);

/**
 * @swagger
 * /api/rides/all:
 *   get:
 *     tags: [Rides]
 *     summary: Get all rides (Admin)
 *     description: Admin-only paginated list of all rides with optional filters.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, available, accepted, in_progress, completed, cancelled] }
 *       - in: query
 *         name: driver_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated ride list }
 */
router.get("/all", protect, authorize("admin", "super_admin"), getAllRides);

/**
 * @swagger
 * /api/rides/{id}:
 *   patch:
 *     tags: [Rides]
 *     summary: Update a ride (Admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fare: { type: number }
 *               departure_time: { type: string, format: date-time }
 *               available_seats: { type: integer }
 *               driver_id: { type: string }
 *               status: { type: string }
 *     responses:
 *       200: { description: Ride updated }
 */
router.patch("/:id", protect, authorize("admin", "super_admin"), updateRide);

/**
 * @swagger
 * /api/rides/{id}/cancel:
 *   post:
 *     tags: [Rides]
 *     summary: Cancel a ride (Admin)
 *     description: Cancels ride and all pending/accepted bookings. Notifies affected users.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ride cancelled }
 */
router.post(
  "/:id/cancel",
  protect,
  authorize("admin", "super_admin"),
  cancelRide,
);

/**
 * @swagger
 * /api/rides/active:
 *   get:
 *     tags: [Rides]
 *     summary: Get active rides
 *     description: Returns upcoming rides (scheduled/available/accepted) with future departure times.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: pickup
 *         schema: { type: string }
 *         description: Filter by pickup location ID
 *       - in: query
 *         name: destination
 *         schema: { type: string }
 *         description: Filter by destination ID
 *     responses:
 *       200: { description: List of active rides }
 */
router.get("/active", protect, getActiveRides);

/**
 * @swagger
 * /api/rides/my-rides:
 *   get:
 *     tags: [Rides]
 *     summary: Get driver's own rides
 *     description: Returns up to 50 rides assigned to the authenticated driver.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Driver's rides list }
 */
router.get("/my-rides", protect, authorize("driver"), getMyRides);

/**
 * @swagger
 * /api/rides/available-requests:
 *   get:
 *     tags: [Rides]
 *     summary: Get available ride requests (Driver)
 *     description: Lists ride requests with no driver assigned that drivers can accept.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Available ride requests }
 */
router.get(
  "/available-requests",
  protect,
  authorize("driver"),
  getAvailableRequests,
);

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     tags: [Rides]
 *     summary: Get ride details
 *     description: Returns a single ride with populated locations, driver, and active bookings.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ride details with bookings }
 *       404: { description: Ride not found }
 */
router.get("/:id", protect, getRideDetails);

/**
 * @swagger
 * /api/rides/{id}/accept:
 *   post:
 *     tags: [Rides]
 *     summary: Accept a ride request (Driver)
 *     description: Driver claims an available ride request, becomes the assigned driver.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ride accepted }
 *       400: { description: Ride not available or driver not approved }
 */
router.post("/:id/accept", protect, authorize("driver"), acceptRide);

/**
 * @swagger
 * /api/rides/{id}/start:
 *   post:
 *     tags: [Rides]
 *     summary: Start a ride (Driver)
 *     description: Transitions ride to in_progress. Requires at least one checked-in passenger.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ride started }
 *       400: { description: No checked-in passengers or invalid status }
 */
router.post("/:id/start", protect, authorize("driver"), startRide);

/**
 * @swagger
 * /api/rides/{id}/location:
 *   post:
 *     tags: [Rides]
 *     summary: Update driver GPS location (Driver)
 *     description: Updates the driver's current coordinates for a ride in progress.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number }
 *               longitude: { type: number }
 *     responses:
 *       200: { description: Location updated }
 */
router.post(
  "/:id/location",
  protect,
  authorize("driver"),
  updateDriverLocation,
);

/**
 * @swagger
 * /api/rides/{id}/end:
 *   post:
 *     tags: [Rides]
 *     summary: End a ride (Driver)
 *     description: Marks ride as completed, timestamps ended_at, completes all associated bookings.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ride ended successfully }
 */
router.post("/:id/end", protect, authorize("driver"), endRide);

module.exports = router;
