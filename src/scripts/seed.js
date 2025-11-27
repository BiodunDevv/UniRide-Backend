require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Driver = require("../models/Driver");
const DriverApplication = require("../models/DriverApplication");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");
const FarePolicy = require("../models/FarePolicy");
const {
  sendDriverApplicationReceivedEmail,
} = require("../services/emailService");

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected for seeding");

    // Clear ALL existing data
    console.log("🗑️  Clearing all existing data...");

    await Booking.deleteMany({});
    console.log("  ✅ Cleared Bookings");

    await Ride.deleteMany({});
    console.log("  ✅ Cleared Rides");

    await Driver.deleteMany({});
    console.log("  ✅ Cleared Drivers");

    await DriverApplication.deleteMany({});
    console.log("  ✅ Cleared Driver Applications");

    await FarePolicy.deleteMany({});
    console.log("  ✅ Cleared Fare Policies");

    await User.deleteMany({});
    console.log("  ✅ Cleared Users");

    // 1. Create Super Admin from .env
    console.log("👑 Creating Super Admin...");
    const superAdmin = await User.findOne({
      email: process.env.DEFAULT_SUPER_ADMIN_EMAIL,
    });

    if (!superAdmin) {
      await User.create({
        name: `${process.env.DEFAULT_SUPER_ADMIN_FIRST_NAME} ${process.env.DEFAULT_SUPER_ADMIN_LAST_NAME}`,
        email: process.env.DEFAULT_SUPER_ADMIN_EMAIL,
        password: process.env.DEFAULT_SUPER_ADMIN_PASSWORD,
        role: "super_admin",
        email_verified: false,
        first_login: false,
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
        name: "John Doe",
        email: "john.doe@test.uniride.com",
        password: "password123",
        role: "user",
        email_verified: true,
      },
      {
        name: "Jane Smith",
        email: "jane.smith@test.uniride.com",
        password: "password123",
        role: "user",
        email_verified: true,
      },
      {
        name: "Mike Johnson",
        email: "mike.johnson@test.uniride.com",
        password: "password123",
        role: "user",
        email_verified: true,
      },
      {
        name: "Sarah Williams",
        email: "sarah.williams@test.uniride.com",
        password: "password123",
        role: "user",
        email_verified: true,
      },
    ];

    const createdUsers = [];
    for (const userData of testUsers) {
      const user = await User.create(userData);
      createdUsers.push(user);
      console.log(`✅ User created: ${user.email}`);
    }

    // 3. Create Test Admins
    console.log("\n🔧 Creating Test Admins...");
    const testAdmins = [
      {
        name: "Admin One",
        email: "admin1@test.uniride.com",
        password: "admin123",
        role: "admin",
        email_verified: true,
        first_login: false,
      },
      {
        name: "Admin Two",
        email: "admin2@test.uniride.com",
        password: "admin123",
        role: "admin",
        email_verified: true,
        first_login: false,
      },
    ];

    const createdAdmins = [];
    for (const adminData of testAdmins) {
      const admin = await User.create(adminData);
      createdAdmins.push(admin);
      console.log(`✅ Admin created: ${admin.email}`);
    }

    // 4. Create Test Driver Applications
    console.log("\n🚗 Creating Test Driver Applications...");
    const testDriverApplications = [
      {
        name: "David Driver",
        email: "david.driver@test.uniride.com",
        password: "password123",
        phone: "+1234567890",
        vehicle_model: "Toyota Camry 2020",
        plate_number: "ABC-1234",
        drivers_license: "https://example.com/license/david.jpg",
      },
      {
        name: "Emma Driver",
        email: "emma.driver@test.uniride.com",
        password: "password123",
        phone: "+1234567891",
        vehicle_model: "Honda Accord 2021",
        plate_number: "XYZ-5678",
        drivers_license: "https://example.com/license/emma.jpg",
      },
      {
        name: "Robert Rider",
        email: "robert.rider@test.uniride.com",
        password: "password123",
        phone: "+1234567892",
        vehicle_model: "Tesla Model 3 2022",
        plate_number: "TES-9012",
        drivers_license: "https://example.com/license/robert.jpg",
      },
    ];

    for (const driverData of testDriverApplications) {
      // Create user account for driver
      const driverUser = await User.create({
        name: driverData.name,
        email: driverData.email,
        password: driverData.password,
        role: "user",
        email_verified: true,
      });

      // Create driver application
      const application = await DriverApplication.create({
        user_id: driverUser._id,
        phone: driverData.phone,
        vehicle_model: driverData.vehicle_model,
        plate_number: driverData.plate_number,
        drivers_license: driverData.drivers_license,
        status: "pending",
      });

      console.log(`✅ Driver application created: ${driverUser.email}`);

      // Send application received email
      try {
        await sendDriverApplicationReceivedEmail({
          name: driverUser.name,
          email: driverUser.email,
          applicationId: application._id,
        });
        console.log(`📧 Application email sent to: ${driverUser.email}`);
      } catch (emailError) {
        console.error(
          `⚠️  Failed to send email to ${driverUser.email}:`,
          emailError.message
        );
      }
    }

    // 5. Create Test Approved Drivers
    console.log("\n✅ Creating Test Approved Drivers...");
    const approvedDriverData = [
      {
        name: "Tom Transporter",
        email: "tom.transporter@test.uniride.com",
        password: "password123",
        phone: "+1234567893",
        vehicle_model: "Ford Focus 2019",
        plate_number: "FOR-3456",
        available_seats: 4,
        bank_name: "Chase Bank",
        bank_account_number: "1234567890",
        bank_account_name: "Tom Transporter",
      },
      {
        name: "Lisa Lifter",
        email: "lisa.lifter@test.uniride.com",
        password: "password123",
        phone: "+1234567894",
        vehicle_model: "Nissan Altima 2020",
        plate_number: "NIS-7890",
        available_seats: 3,
        bank_name: "Bank of America",
        bank_account_number: "0987654321",
        bank_account_name: "Lisa Lifter",
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

      const driver = await Driver.create({
        user_id: driverUser._id,
        phone: driverData.phone,
        vehicle_model: driverData.vehicle_model,
        plate_number: driverData.plate_number,
        available_seats: driverData.available_seats,
        drivers_license: "https://example.com/license/approved.jpg",
        application_status: "approved",
        approved_by: createdAdmins[0]._id,
        approval_date: new Date(),
        status: "active",
        rating: 4.5,
        bank_name: driverData.bank_name,
        bank_account_number: driverData.bank_account_number,
        bank_account_name: driverData.bank_account_name,
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
    console.log("   Email: admin1@test.uniride.com | Password: admin123");
    console.log("   Email: admin2@test.uniride.com | Password: admin123");
    console.log("\n👥 Regular Users:");
    console.log("   Email: john.doe@test.uniride.com | Password: password123");
    console.log(
      "   Email: jane.smith@test.uniride.com | Password: password123"
    );
    console.log(
      "   Email: mike.johnson@test.uniride.com | Password: password123"
    );
    console.log(
      "   Email: sarah.williams@test.uniride.com | Password: password123"
    );
    console.log("\n🚗 Pending Driver Applications:");
    console.log(
      "   Email: david.driver@test.uniride.com | Password: password123"
    );
    console.log(
      "   Email: emma.driver@test.uniride.com | Password: password123"
    );
    console.log(
      "   Email: robert.rider@test.uniride.com | Password: password123"
    );
    console.log("\n✅ Approved Drivers:");
    console.log(
      "   Email: tom.transporter@test.uniride.com | Password: password123"
    );
    console.log(
      "   Email: lisa.lifter@test.uniride.com | Password: password123"
    );
    console.log("\n========================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
};

seedDatabase();
