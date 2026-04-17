const CampusLocation = require("../models/CampusLocation");
const { sanitizeLatLng } = require("../utils/geo");

// ── Get all locations (public, for mobile + web) ────────────────────────────
const getLocations = async (req, res, next) => {
  try {
    const { category, search, active_only } = req.query;
    const filter = {};

    if (active_only !== "false") filter.is_active = true;
    if (category) filter.category = category;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { short_name: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    const locations = await CampusLocation.find(filter).sort({
      is_popular: -1,
      order: 1,
      name: 1,
    });

    res
      .status(200)
      .json({ success: true, count: locations.length, data: locations });
  } catch (error) {
    next(error);
  }
};

// ── Get single location ─────────────────────────────────────────────────────
const getLocationById = async (req, res, next) => {
  try {
    const location = await CampusLocation.findById(req.params.id);
    if (!location)
      return res
        .status(404)
        .json({ success: false, message: "Location not found" });

    res.status(200).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Create location ──────────────────────────────────────────────────
const createLocation = async (req, res, next) => {
  try {
    const {
      name,
      short_name,
      category,
      latitude,
      longitude,
      address,
      description,
      icon,
      is_popular,
      order,
    } = req.body;

    if (!name || !category || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "name, category, latitude, and longitude are required",
      });
    }

    const safeLocation = sanitizeLatLng(latitude, longitude);
    if (!safeLocation) {
      return res.status(400).json({
        success: false,
        message: "A valid latitude and longitude are required",
      });
    }

    const location = await CampusLocation.create({
      name,
      short_name: short_name || name,
      category,
      coordinates: {
        type: "Point",
        coordinates: [safeLocation.longitude, safeLocation.latitude],
      },
      address: address || name,
      description,
      icon: icon || getCategoryIcon(category),
      is_popular: is_popular || false,
      order: order || 0,
    });

    res
      .status(201)
      .json({ success: true, message: "Location created", data: location });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Location with this name already exists",
        });
    }
    next(error);
  }
};

// ── Admin: Update location ──────────────────────────────────────────────────
const updateLocation = async (req, res, next) => {
  try {
    const location = await CampusLocation.findById(req.params.id);
    if (!location)
      return res
        .status(404)
        .json({ success: false, message: "Location not found" });

    const {
      name,
      short_name,
      category,
      latitude,
      longitude,
      address,
      description,
      icon,
      is_active,
      is_popular,
      order,
    } = req.body;

    if (name !== undefined) location.name = name;
    if (short_name !== undefined) location.short_name = short_name;
    if (category !== undefined) location.category = category;
    if (address !== undefined) location.address = address;
    if (description !== undefined) location.description = description;
    if (icon !== undefined) location.icon = icon;
    if (is_active !== undefined) location.is_active = is_active;
    if (is_popular !== undefined) location.is_popular = is_popular;
    if (order !== undefined) location.order = order;

    if (latitude !== undefined && longitude !== undefined) {
      const safeLocation = sanitizeLatLng(latitude, longitude);
      if (!safeLocation) {
        return res.status(400).json({
          success: false,
          message: "A valid latitude and longitude are required",
        });
      }
      location.coordinates = {
        type: "Point",
        coordinates: [safeLocation.longitude, safeLocation.latitude],
      };
    }

    await location.save();

    res
      .status(200)
      .json({ success: true, message: "Location updated", data: location });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Delete location ──────────────────────────────────────────────────
const deleteLocation = async (req, res, next) => {
  try {
    const location = await CampusLocation.findById(req.params.id);
    if (!location)
      return res
        .status(404)
        .json({ success: false, message: "Location not found" });

    await location.deleteOne();

    res.status(200).json({ success: true, message: "Location deleted" });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Bulk create locations ────────────────────────────────────────────
const bulkCreateLocations = async (req, res, next) => {
  try {
    const { locations } = req.body;
    if (!Array.isArray(locations) || locations.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "locations array is required" });
    }

    const docs = locations.map((loc) => {
      const safeLocation = sanitizeLatLng(loc.latitude, loc.longitude);
      if (!safeLocation) {
        throw new Error(`Invalid coordinates for location: ${loc.name}`);
      }

      return {
        name: loc.name,
        short_name: loc.short_name || loc.name,
        category: loc.category,
        coordinates: {
          type: "Point",
          coordinates: [safeLocation.longitude, safeLocation.latitude],
        },
        address: loc.address || loc.name,
        description: loc.description,
        icon: loc.icon || getCategoryIcon(loc.category),
        is_popular: loc.is_popular || false,
        order: loc.order || 0,
      };
    });

    const result = await CampusLocation.insertMany(docs, { ordered: false });

    res.status(201).json({
      success: true,
      message: `${result.length} locations created`,
      data: result,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: "Some locations already exist" });
    }
    next(error);
  }
};

// ── Get locations grouped by category ───────────────────────────────────────
const getLocationsByCategory = async (req, res, next) => {
  try {
    const locations = await CampusLocation.find({ is_active: true }).sort({
      is_popular: -1,
      order: 1,
      name: 1,
    });

    const grouped = {};
    locations.forEach((loc) => {
      if (!grouped[loc.category]) grouped[loc.category] = [];
      grouped[loc.category].push(loc);
    });

    res.status(200).json({ success: true, data: grouped });
  } catch (error) {
    next(error);
  }
};

// Helper: get default icon by category
function getCategoryIcon(category) {
  const icons = {
    academic: "school",
    hostel: "bed",
    cafeteria: "restaurant",
    admin_building: "business",
    religious: "heart",
    library: "library",
    market: "cart",
    other: "location",
  };
  return icons[category] || "location";
}

module.exports = {
  getLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
  bulkCreateLocations,
  getLocationsByCategory,
};
