/**
 * Seed campus locations for UniRide
 * Run: node src/scripts/seedLocations.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const CampusLocation = require("../models/CampusLocation");
const connectDB = require("../config/db");

// ── Campus Locations ────────────────────────────────────────────────────────
// Coordinates approximate to a Nigerian university campus layout
// Base reference point: ~7.52°N, 4.52°E (Osun State area)
const locations = [
  // ── Administrative Buildings ──────────────────────────────────────────
  {
    name: "Senate Building",
    short_name: "Senate",
    category: "admin_building",
    latitude: 7.5245,
    longitude: 4.5215,
    address: "Senate Building, Permanent Site",
    description: "Main administrative building on the permanent site",
    is_popular: true,
    order: 1,
  },
  {
    name: "Old Admin Block",
    short_name: "Old Admin",
    category: "admin_building",
    latitude: 7.5195,
    longitude: 4.5165,
    address: "Old Admin Block, Old Site",
    description: "Administrative block on the old site",
    is_popular: true,
    order: 2,
  },

  // ── Markets & Plazas ─────────────────────────────────────────────────
  {
    name: "New Horizon",
    short_name: "New Horizon",
    category: "market",
    latitude: 7.523,
    longitude: 4.52,
    address: "New Horizon Plaza",
    description: "Shopping and recreation area",
    is_popular: true,
    order: 3,
  },
  {
    name: "Complex Market",
    short_name: "Complex",
    category: "market",
    latitude: 7.521,
    longitude: 4.518,
    address: "Complex Market",
    description: "Main commercial complex on campus",
    is_popular: true,
    order: 4,
  },

  // ── Cafeterias ────────────────────────────────────────────────────────
  {
    name: "Kemi Bee Cafeteria",
    short_name: "Kemi Bee",
    category: "cafeteria",
    latitude: 7.5192,
    longitude: 4.5158,
    address: "Kemi Bee Cafeteria, Old Site",
    description: "Popular cafeteria on the old site",
    is_popular: true,
    order: 5,
  },
  {
    name: "Divine Cafeteria",
    short_name: "Divine",
    category: "cafeteria",
    latitude: 7.519,
    longitude: 4.5162,
    address: "Divine Cafeteria, Old Site",
    description: "Cafeteria on the old site",
    is_popular: false,
    order: 6,
  },
  {
    name: "Forza Cafeteria",
    short_name: "Forza",
    category: "cafeteria",
    latitude: 7.5225,
    longitude: 4.5195,
    address: "Forza Cafeteria",
    description: "Forza campus eatery",
    is_popular: false,
    order: 7,
  },
  {
    name: "Bua Cafeteria",
    short_name: "Bua",
    category: "cafeteria",
    latitude: 7.5222,
    longitude: 4.5192,
    address: "Bua Cafeteria",
    description: "Bua campus eatery",
    is_popular: false,
    order: 8,
  },
  {
    name: "BBSF Cafeteria",
    short_name: "BBSF",
    category: "cafeteria",
    latitude: 7.522,
    longitude: 4.519,
    address: "BBSF Cafeteria",
    description: "BBSF campus eatery",
    is_popular: false,
    order: 9,
  },

  // ── Academic Buildings & Labs ─────────────────────────────────────────
  {
    name: "NLT, Aga",
    short_name: "NLT",
    category: "academic",
    latitude: 7.525,
    longitude: 4.522,
    address: "New Lecture Theatre, Aga",
    description: "New Lecture Theatre complex",
    is_popular: true,
    order: 10,
  },
  {
    name: "LAS Lecture Hall",
    short_name: "LAS Hall",
    category: "academic",
    latitude: 7.5248,
    longitude: 4.5218,
    address: "LAS Lecture Hall",
    description: "Liberal Arts & Sciences lecture hall",
    is_popular: true,
    order: 11,
  },
  {
    name: "Physics Lab",
    short_name: "Physics Lab",
    category: "academic",
    latitude: 7.5252,
    longitude: 4.5225,
    address: "Physics Laboratory",
    description: "Physics department laboratory",
    is_popular: false,
    order: 12,
  },
  {
    name: "Architecture Lab",
    short_name: "Arch. Lab",
    category: "academic",
    latitude: 7.5254,
    longitude: 4.5228,
    address: "Architecture Laboratory",
    description: "Architecture department laboratory",
    is_popular: false,
    order: 13,
  },
  {
    name: "Chemistry Building",
    short_name: "Chemistry",
    category: "academic",
    latitude: 7.5256,
    longitude: 4.523,
    address: "Chemistry Building",
    description: "Chemistry department building",
    is_popular: false,
    order: 14,
  },

  // ── Colleges (Faculty Buildings) ──────────────────────────────────────
  {
    name: "College of Health Sciences (COHES)",
    short_name: "COHES",
    category: "academic",
    latitude: 7.526,
    longitude: 4.5235,
    address: "College of Health Sciences",
    description: "Faculty of Health Sciences",
    is_popular: true,
    order: 15,
  },
  {
    name: "College of Law (COLAW)",
    short_name: "COLAW",
    category: "academic",
    latitude: 7.5262,
    longitude: 4.5238,
    address: "College of Law",
    description: "Faculty of Law",
    is_popular: true,
    order: 16,
  },
  {
    name: "College of Computing & Communication Studies (COCCS)",
    short_name: "COCCS",
    category: "academic",
    latitude: 7.5265,
    longitude: 4.524,
    address: "College of Computing and Communication Studies",
    description: "Faculty of Computing and Communication",
    is_popular: true,
    order: 17,
  },
  {
    name: "College of Agriculture, Engineering & Sciences",
    short_name: "Agric/Eng",
    category: "academic",
    latitude: 7.5268,
    longitude: 4.5242,
    address: "College of Agriculture, Engineering and Sciences",
    description: "Faculty of Agriculture, Engineering and Sciences",
    is_popular: false,
    order: 18,
  },
  {
    name: "College of Liberal Studies (COLBS)",
    short_name: "COLBS",
    category: "academic",
    latitude: 7.527,
    longitude: 4.5245,
    address: "College of Liberal Studies",
    description: "Faculty of Liberal Studies",
    is_popular: false,
    order: 19,
  },
  {
    name: "College of Environmental Sciences (COEVS)",
    short_name: "COEVS",
    category: "academic",
    latitude: 7.5272,
    longitude: 4.5248,
    address: "College of Environmental Sciences",
    description: "Faculty of Environmental Sciences",
    is_popular: false,
    order: 20,
  },
  {
    name: "College of Postgraduate",
    short_name: "Postgrad",
    category: "academic",
    latitude: 7.5275,
    longitude: 4.525,
    address: "College of Postgraduate Studies",
    description: "Postgraduate college building",
    is_popular: false,
    order: 21,
  },

  // ── Religious ─────────────────────────────────────────────────────────
  {
    name: "Chapel",
    short_name: "Chapel",
    category: "religious",
    latitude: 7.524,
    longitude: 4.521,
    address: "University Chapel",
    description: "Main campus chapel",
    is_popular: true,
    order: 22,
  },

  // ── Library & ICT ─────────────────────────────────────────────────────
  {
    name: "Library / ICT Centre",
    short_name: "Library",
    category: "library",
    latitude: 7.5242,
    longitude: 4.5212,
    address: "University Library and ICT Centre",
    description: "Main library and ICT resource centre",
    is_popular: true,
    order: 23,
  },
  {
    name: "CBT Centre",
    short_name: "CBT",
    category: "library",
    latitude: 7.5244,
    longitude: 4.5214,
    address: "Computer Based Test Centre",
    description: "CBT examination centre",
    is_popular: true,
    order: 24,
  },

  // ── Hostels ───────────────────────────────────────────────────────────
  {
    name: "Boys Hostel",
    short_name: "Boys Hostel",
    category: "hostel",
    latitude: 7.52,
    longitude: 4.517,
    address: "Boys Hostel",
    description: "Main boys hostel",
    is_popular: true,
    order: 25,
  },
  {
    name: "Boys Hostel NH",
    short_name: "Boys NH",
    category: "hostel",
    latitude: 7.5202,
    longitude: 4.5172,
    address: "Boys Hostel, New Horizon",
    description: "Boys hostel at New Horizon",
    is_popular: false,
    order: 26,
  },
  {
    name: "Boys Hostel Extension",
    short_name: "Boys Ext.",
    category: "hostel",
    latitude: 7.5204,
    longitude: 4.5174,
    address: "Boys Hostel Extension",
    description: "Boys hostel extension block",
    is_popular: false,
    order: 27,
  },
  {
    name: "288 Girls Hostel",
    short_name: "288 Girls",
    category: "hostel",
    latitude: 7.5206,
    longitude: 4.5176,
    address: "288 Girls Hostel",
    description: "288-bed girls hostel",
    is_popular: true,
    order: 28,
  },
  {
    name: "Ademola Ishola Girls Hostel",
    short_name: "Ademola Ishola",
    category: "hostel",
    latitude: 7.5208,
    longitude: 4.5178,
    address: "Ademola Ishola Girls Hostel",
    description: "Ademola Ishola girls hostel",
    is_popular: false,
    order: 29,
  },
  {
    name: "UPE 1 (Girls)",
    short_name: "UPE 1",
    category: "hostel",
    latitude: 7.521,
    longitude: 4.518,
    address: "UPE 1 Girls Hostel",
    description: "University Preparatory Education hostel 1 for girls",
    is_popular: false,
    order: 30,
  },
  {
    name: "UPE 2 (Boys)",
    short_name: "UPE 2",
    category: "hostel",
    latitude: 7.5212,
    longitude: 4.5182,
    address: "UPE 2 Boys Hostel",
    description: "University Preparatory Education hostel 2 for boys",
    is_popular: false,
    order: 31,
  },
  {
    name: "UPE 3 (Boys)",
    short_name: "UPE 3",
    category: "hostel",
    latitude: 7.5214,
    longitude: 4.5184,
    address: "UPE 3 Boys Hostel",
    description: "University Preparatory Education hostel 3 for boys",
    is_popular: false,
    order: 32,
  },
  {
    name: "Block Hostel",
    short_name: "Block Hostel",
    category: "hostel",
    latitude: 7.5216,
    longitude: 4.5186,
    address: "Block Hostel",
    description: "Block hostel accommodation",
    is_popular: false,
    order: 33,
  },
  {
    name: "Sadler Hostel",
    short_name: "Sadler",
    category: "hostel",
    latitude: 7.5218,
    longitude: 4.5188,
    address: "Sadler Hostel",
    description: "Sadler hostel accommodation",
    is_popular: false,
    order: 34,
  },
  {
    name: "SB (Story Building Hostel)",
    short_name: "SB Hostel",
    category: "hostel",
    latitude: 7.522,
    longitude: 4.519,
    address: "Story Building Hostel",
    description: "Story Building (SB) hostel",
    is_popular: false,
    order: 35,
  },
];

async function seedLocations() {
  try {
    await connectDB();
    console.log("🔗 Connected to database");

    // Clear existing locations
    const deleted = await CampusLocation.deleteMany({});
    console.log(`🗑️  Cleared ${deleted.deletedCount} existing locations`);

    // Insert all locations
    const docs = locations.map((loc) => ({
      name: loc.name,
      short_name: loc.short_name,
      category: loc.category,
      coordinates: {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude],
      },
      address: loc.address,
      description: loc.description,
      is_popular: loc.is_popular,
      order: loc.order,
      icon: getCategoryIcon(loc.category),
    }));

    const result = await CampusLocation.insertMany(docs);
    console.log(`✅ Seeded ${result.length} campus locations\n`);

    // Print summary
    const categories = {};
    result.forEach((loc) => {
      if (!categories[loc.category]) categories[loc.category] = 0;
      categories[loc.category]++;
    });

    console.log("📍 Location Summary:");
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error.message);
    process.exit(1);
  }
}

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

seedLocations();
