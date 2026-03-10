const express = require("express");
const router = express.Router();
const {
  getPlatformSettings,
  getFullPlatformSettings,
  updatePlatformSettings,
} = require("../controllers/platformSettingsController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");

/**
 * @swagger
 * /api/platform-settings:
 *   get:
 *     summary: Get public platform settings
 *     description: Returns platform configuration that mobile apps poll on startup (map provider, fare info, maintenance mode, version requirements, etc.). No authentication required.
 *     tags: [Platform Settings]
 *     responses:
 *       200:
 *         description: Public platform settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     map_provider:
 *                       type: string
 *                       enum: [mapbox, expo]
 *                     mapbox_enabled:
 *                       type: boolean
 *                     expo_maps_enabled:
 *                       type: boolean
 *                     fare_per_seat:
 *                       type: number
 *                     maintenance_mode:
 *                       type: boolean
 *                     app_version_minimum:
 *                       type: string
 *                     max_seats_per_booking:
 *                       type: number
 *                     allow_ride_without_driver:
 *                       type: boolean
 *                     auto_accept_bookings:
 *                       type: boolean
 *                     fare_policy:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         mode:
 *                           type: string
 *                         base_fare:
 *                           type: number
 *                         minimum_fare:
 *                           type: number
 *                         per_km_rate:
 *                           type: number
 */
router.get("/", getPlatformSettings);

/**
 * @swagger
 * /api/platform-settings/admin:
 *   get:
 *     summary: Get full platform settings (admin)
 *     description: Returns the complete platform settings document including metadata fields. Admin or super_admin only.
 *     tags: [Platform Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full platform settings object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get(
  "/admin",
  protect,
  authorize("admin", "super_admin"),
  getFullPlatformSettings,
);

/**
 * @swagger
 * /api/platform-settings:
 *   patch:
 *     summary: Update platform settings (admin)
 *     description: Updates one or more platform settings fields. Only allowed fields are accepted. Admin or super_admin only.
 *     tags: [Platform Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               map_provider:
 *                 type: string
 *                 enum: [mapbox, expo]
 *               mapbox_enabled:
 *                 type: boolean
 *               expo_maps_enabled:
 *                 type: boolean
 *               fare_per_seat:
 *                 type: number
 *               maintenance_mode:
 *                 type: boolean
 *               app_version_minimum:
 *                 type: string
 *               max_seats_per_booking:
 *                 type: number
 *               allow_ride_without_driver:
 *                 type: boolean
 *               auto_accept_bookings:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: No valid fields to update
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.patch(
  "/",
  protect,
  authorize("admin", "super_admin"),
  updatePlatformSettings,
);

module.exports = router;
