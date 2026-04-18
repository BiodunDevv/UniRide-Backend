require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const FarePolicy = require("../models/FarePolicy");
const NotificationSettings = require("../models/NotificationSettings");
const Language = require("../models/Language");
const CampusLocation = require("../models/CampusLocation");

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected for seeding");

    // Drop the entire database to ensure clean slate
    console.log("🗑️  Dropping entire database for clean slate...");
    await mongoose.connection.dropDatabase();
    console.log("  ✅ Database dropped successfully");

    // Drop and recreate indexes to remove old user_id unique index
    console.log("\n🔧 Recreating collections with proper indexes...");

    // This will recreate collections with current schema indexes
    await User.createCollection().catch(() => {});
    await Driver.createCollection().catch(() => {});
    await DriverApplication.createCollection().catch(() => {});
    await Ride.createCollection().catch(() => {});
    await Booking.createCollection().catch(() => {});
    await FarePolicy.createCollection().catch(() => {});
    await NotificationSettings.createCollection().catch(() => {});
    await Language.createCollection().catch(() => {});
    await CampusLocation.createCollection().catch(() => {});

    console.log("  ✅ Collections recreated with fresh indexes");

    // 0. Seed default languages
    console.log("🌐 Seeding default languages...");
    const defaultLanguages = [
      { code: "en", name: "English", native_name: "English", is_default: true },
      { code: "yo", name: "Yoruba", native_name: "Yorùbá", is_default: false },
      { code: "ha", name: "Hausa", native_name: "Hausa", is_default: false },
      { code: "ig", name: "Igbo", native_name: "Igbo", is_default: false },
    ];
    for (const lang of defaultLanguages) {
      await Language.create(lang);
      console.log(`  ✅ Language: ${lang.name} (${lang.code})`);
    }

    // 1. Create Super Admin from .env
    console.log("👑 Creating Super Admin...");
    const superAdmin = await User.findOne({
      email: process.env.DEFAULT_SUPER_ADMIN_EMAIL,
    });

    if (!superAdmin) {
      const newSuperAdmin = await User.create({
        name: `${process.env.DEFAULT_SUPER_ADMIN_FIRST_NAME} ${process.env.DEFAULT_SUPER_ADMIN_LAST_NAME}`,
        email: process.env.DEFAULT_SUPER_ADMIN_EMAIL,
        password: process.env.DEFAULT_SUPER_ADMIN_PASSWORD,
        role: "super_admin",
        email_verified: false,
        first_login: false,
      });

      // Create notification settings with all notifications enabled by default
      await NotificationSettings.create({
        user_id: newSuperAdmin._id,
        push_notifications_enabled: true,
        email_notifications_enabled: true,
        notification_preferences: {
          new_driver_applications: true,
          user_flagged: true,
          system_alerts: true,
          user_reports: true,
          promotional_messages: true,
          broadcast_messages: true,
        },
      });

      console.log(
        `✅ Super Admin created: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`,
      );
    } else {
      console.log(
        `ℹ️  Super Admin already exists: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`,
      );
    }

    // 2. Create Test Regular Users
    console.log("\n👥 Creating Test Users...");
    const testUsers = [
      { 
        name: "Muhammed Mustapha",
        email: "mustapha.muhammed@bowen.edu.ng",
        password: "balikiss12",
        role: "user",
        email_verified: true,
      },
      {
        name: "ProfileX",
        email: "profilex.dev@gmail.com",
        password: "balikiss12",
        role: "user",
        email_verified: true,
      },
      {
        name: "Gmm",
        email: "gmm527000@gmail.com",
        password: "balikiss12",
        role: "user",
        email_verified: true,
      },
    ];

    const createdUsers = [];
    for (const userData of testUsers) {
      const user = await User.create(userData);
      createdUsers.push(user);

      // Create notification settings with all notifications enabled by default
      await NotificationSettings.create({
        user_id: user._id,
        push_notifications_enabled: true,
        email_notifications_enabled: true,
        notification_preferences: {
          ride_requests: true,
          ride_accepted: true,
          ride_started: true,
          ride_completed: true,
          driver_nearby: true,
          payment_received: true,
          promotional_messages: true,
          broadcast_messages: true,
        },
      });

      console.log(`✅ User created: ${user.email}`);
    }

    // 3. Create Test Admins
    console.log("\n🔧 Creating Test Admins...");
    const testAdmins = [
      {
        name: "Muhammed Abiodun",
        email: "muhammedabiodun43@gmail.com",
        password: "balikiss12",
        role: "admin",
        email_verified: false,
        first_login: false,
      },
    ];

    const createdAdmins = [];
    for (const adminData of testAdmins) {
      const admin = await User.create(adminData);
      createdAdmins.push(admin);

      // Create notification settings with all notifications enabled by default
      await NotificationSettings.create({
        user_id: admin._id,
        push_notifications_enabled: true,
        email_notifications_enabled: true,
        notification_preferences: {
          new_driver_applications: true,
          user_flagged: true,
          system_alerts: true,
          user_reports: true,
          promotional_messages: true,
          broadcast_messages: true,
        },
      });

      console.log(`✅ Admin created: ${admin.email}`);
    }

    // 4. Create Test Driver Applications (Pending - optional, can be commented out)
    // Skipping pending applications to avoid sending emails to fake addresses

    // 5. Create Test Approved Drivers
    console.log("\n✅ Creating Test Approved Drivers...");
    const approvedDriverData = [
      {
        name: "Muhammed Abiodun",
        email: "muhammedabiodun42@gmail.com",
        password: "balikiss12",
        phone: "+2348012345678",
        vehicle_model: "Toyota Camry 2020",
        plate_number: "ABC-1234",
        available_seats: 4,
        vehicle_color: "Black",
        vehicle_description: "Clean and comfortable campus ride",
        bank_name: "GTBank",
        bank_account_number: "0123456789",
        bank_account_name: "Muhammed Abiodun",
      },
    ];

    for (const driverData of approvedDriverData) {
      const driverUser = await User.create({
        name: driverData.name,
        email: driverData.email,
        password: driverData.password,
        role: "driver",
        email_verified: true,
        first_login: false,
        is_flagged: false,
      });

      // Create Driver profile document
      await Driver.create({
        user_id: driverUser._id,
        phone: driverData.phone,
        vehicle_model: driverData.vehicle_model,
        plate_number: driverData.plate_number,
        available_seats: driverData.available_seats,
        vehicle_color: driverData.vehicle_color,
        vehicle_description: driverData.vehicle_description,
        bank_name: driverData.bank_name,
        bank_account_number: driverData.bank_account_number,
        bank_account_name: driverData.bank_account_name,
        drivers_license: "https://placehold.co/600x400?text=Test+License",
        application_status: "approved",
        status: "inactive",
        rating: 0,
        total_ratings: 0,
      });

      // Create notification settings with all notifications enabled by default
      await NotificationSettings.create({
        user_id: driverUser._id,
        push_notifications_enabled: true,
        email_notifications_enabled: true,
        notification_preferences: {
          new_ride_requests: true,
          booking_confirmed: true,
          payment_received: true,
          promotional_messages: true,
          broadcast_messages: true,
        },
      });

      console.log(
        `✅ Approved driver created: ${driverUser.email} (+ Driver profile)`,
      );
    }

    // 6. Seed Campus Locations
    console.log("\n📍 Seeding Campus Locations...");
    const campusLocations = [
      // ── Administrative Buildings ──────────────────────────────────────
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

      // ── Markets & Plazas ─────────────────────────────────────────────
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

      // ── Cafeterias ────────────────────────────────────────────────────
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

      // ── Academic Buildings & Labs ─────────────────────────────────────
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

      // ── Colleges (Faculty Buildings) ──────────────────────────────────
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

      // ── Religious ─────────────────────────────────────────────────────
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

      // ── Library & ICT ─────────────────────────────────────────────────
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

      // ── Hostels ───────────────────────────────────────────────────────
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

    const categoryIcons = {
      academic: "school",
      hostel: "bed",
      cafeteria: "restaurant",
      admin_building: "business",
      religious: "heart",
      library: "library",
      market: "cart",
      other: "location",
    };

    const locationDocs = campusLocations.map((loc) => ({
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
      icon: categoryIcons[loc.category] || "location",
    }));

    const insertedLocations = await CampusLocation.insertMany(locationDocs);
    console.log(`✅ Seeded ${insertedLocations.length} campus locations`);

    // Print location summary by category
    const catSummary = {};
    insertedLocations.forEach((loc) => {
      catSummary[loc.category] = (catSummary[loc.category] || 0) + 1;
    });
    Object.entries(catSummary).forEach(([cat, count]) => {
      console.log(`   📍 ${cat}: ${count}`);
    });

    console.log("\n🎉 ========================================");
    console.log("✅ Database seeded successfully!");
    console.log("========================================");
    console.log("\n📋 Test Accounts Summary:");
    console.log("\n👑 Super Admin:");
    console.log(`   Email: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${process.env.DEFAULT_SUPER_ADMIN_PASSWORD}`);
    console.log("\n🔧 Admins:");
    console.log("   Email: muhammedabiodun43@gmail.com | Password: balikiss12");
    console.log("\n👥 Regular Users:");
    console.log(
      "   Email: mustapha.muhammed@bowen.edu.ng | Password: balikiss12",
    );
    console.log("   Email: profilex.dev@gmail.com | Password: balikiss12");
    console.log("   Email: gmm527000@gmail.com | Password: balikiss12");
    console.log("\n✅ Approved Drivers:");
    console.log("   Email: muhammedabiodun42@gmail.com | Password: balikiss12");
    console.log(`\n📍 Campus Locations: ${insertedLocations.length} total`);
    console.log("\n========================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
};

seedDatabase();
