require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const FarePolicy = require("../models/FarePolicy");
const NotificationSettings = require("../models/NotificationSettings");


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

    console.log("  ✅ Collections recreated with fresh indexes");

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
        `✅ Super Admin created: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`
      );
    } else {
      console.log(
        `ℹ️  Super Admin already exists: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`
      );
    }

    // 2. Create Test Regular Users
    console.log("\n👥 Creating Test Users...");
    const testUsers = [
      {
      name: "Muhammed Mustapha",
      email: "mustapha.muhammed@bowen.edu.ng",
      password: "Muhammed",
      role: "user",
      email_verified: true,
      },
      {
      name: "ProfileX",
      email: "profilex.dev@gmail.com",
      password: "ProfileX",
      role: "user",
      email_verified: true,
      },
      {
      name: "Gmm",
      email: "gmm527000@gmail.com",
      password: "Gmm527000",
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
        password: "Muhammed",
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
        password: "Muhammed",
        phone: "+2348012345678",
        vehicle_model: "Toyota Camry 2020",
        plate_number: "ABC-1234",
        available_seats: 4,
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

      console.log(`✅ Approved driver created: ${driverUser.email}`);
    }

    console.log("\n🎉 ========================================");
    console.log("✅ Database seeded successfully!");
    console.log("========================================");
    console.log("\n📋 Test Accounts Summary:");
    console.log("\n👑 Super Admin:");
    console.log(`   Email: ${process.env.DEFAULT_SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${process.env.DEFAULT_SUPER_ADMIN_PASSWORD}`);
    console.log("\n🔧 Admins:");
    console.log("   Email: muhammedabiodun43@gmail.com | Password: Muhammed");
    console.log("\n👥 Regular Users:");
    console.log(
      "   Email: mustapha.muhammed@bowen.edu.ng | Password: Muhammed"
    );
    console.log("   Email: profilex.dev@gmail.com | Password: ProfileX");
    console.log("   Email: gmm527000@gmail.com | Password: Gmm527000");
    console.log("\n✅ Approved Drivers:");
    console.log(
      "   Email: muhammedabiodun42@gmail.com | Password: Muhammed"
    );
    console.log("\n========================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
};

seedDatabase();
