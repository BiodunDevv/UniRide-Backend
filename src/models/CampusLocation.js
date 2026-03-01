const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 *   schemas:
 *     CampusLocation:
 *       type: object
 *       required:
 *         - name
 *         - coordinates
 *         - category
 *       properties:
 *         name:
 *           type: string
 *         short_name:
 *           type: string
 *         category:
 *           type: string
 *           enum: [academic, hostel, cafeteria, admin, religious, library, other]
 *         coordinates:
 *           type: object
 *         address:
 *           type: string
 *         description:
 *           type: string
 *         icon:
 *           type: string
 *         is_active:
 *           type: boolean
 *         is_popular:
 *           type: boolean
 *         order:
 *           type: number
 */

const campusLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    short_name: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "academic",
        "hostel",
        "cafeteria",
        "admin_building",
        "religious",
        "library",
        "market",
        "other",
      ],
      required: true,
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    address: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      default: "location",
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    is_popular: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Geospatial index
campusLocationSchema.index({ coordinates: "2dsphere" });
campusLocationSchema.index({ category: 1, is_active: 1 });
campusLocationSchema.index({ name: "text", short_name: "text" });

const CampusLocation = mongoose.model("CampusLocation", campusLocationSchema);

module.exports = CampusLocation;
