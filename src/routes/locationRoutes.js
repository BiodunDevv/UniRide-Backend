const express = require("express");
const router = express.Router();
const {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
  bulkCreateLocations,
  getLocationsByCategory,
} = require("../controllers/locationController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");
const { apiLimiter } = require("../middlewares/rateLimit");

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: Campus location management
 */

// Public: get all locations (for users to search / browse)
router.get("/", protect, getLocations);
router.get("/grouped", protect, getLocationsByCategory);
router.get("/:id", protect, getLocationById);

// Admin: CRUD locations
router.post(
  "/",
  protect,
  authorize("admin", "super_admin"),
  apiLimiter,
  createLocation,
);
router.post(
  "/bulk",
  protect,
  authorize("admin", "super_admin"),
  apiLimiter,
  bulkCreateLocations,
);
router.patch(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  updateLocation,
);
router.delete(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  deleteLocation,
);

module.exports = router;
