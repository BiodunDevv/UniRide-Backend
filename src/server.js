require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { setSocketIO } = require("./services/notificationService");
const { setIO } = require("./utils/socketManager");
const { initializeSupportSocket } = require("./socket/supportSocket");
const User = require("./models/User");

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = require("socket.io")(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Set Socket.io instance in notification service
setSocketIO(io);

// Set Socket.io instance in socket manager
setIO(io);

// Initialize support socket namespace
initializeSupportSocket(io);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Handle user joining their personal room
  socket.on("join-room", (data) => {
    const { user_id, role } = data;

    if (user_id && role) {
      socket.join(`${role}-${user_id}`);
      console.log(
        `✅ User ${user_id} (${role}) joined room: ${role}-${user_id}`
      );
    }
  });

  // Handle drivers joining available-drivers room
  socket.on("driver-available", (data) => {
    const { driver_id } = data;
    socket.join("available-drivers");
    console.log(`🚗 Driver ${driver_id} joined available-drivers room`);
  });

  // Handle drivers leaving available-drivers room
  socket.on("driver-unavailable", (data) => {
    const { driver_id } = data;
    socket.leave("available-drivers");
    console.log(`🚗 Driver ${driver_id} left available-drivers room`);
  });

  // Handle real-time location updates
  socket.on("update-location", (data) => {
    const { ride_id, latitude, longitude } = data;
    // Broadcast to users in this ride
    io.to(`ride-${ride_id}`).emit("driver-location-update", {
      latitude,
      longitude,
      timestamp: new Date(),
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis (non-blocking)
    await connectRedis();

    // Create default super admin if not exists
    await createDefaultSuperAdmin();

    // Start server
    server.listen(PORT, () => {
      console.log(`\n✨ ========================================`);
      console.log(`🚀 UniRide Server is running!`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      console.log(`========================================\n`);
    });
  } catch (error) {
    console.error("❌ Server startup error:", error.message);
    process.exit(1);
  }
};

// Create default super admin
const createDefaultSuperAdmin = async () => {
  try {
    const superAdminEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL;

    if (!superAdminEmail) {
      console.log("⚠️ No default super admin email configured");
      return;
    }

    const existingSuperAdmin = await User.findOne({ email: superAdminEmail });

    if (existingSuperAdmin) {
      console.log("✅ Default super admin already exists");
      return;
    }

    const superAdmin = await User.create({
      name: `${process.env.DEFAULT_SUPER_ADMIN_FIRST_NAME} ${process.env.DEFAULT_SUPER_ADMIN_LAST_NAME}`,
      email: superAdminEmail,
      password: process.env.DEFAULT_SUPER_ADMIN_PASSWORD,
      role: "super_admin",
      first_login: false,
    });

    console.log(`✅ Default super admin created: ${superAdmin.email}`);
  } catch (error) {
    console.error("❌ Error creating default super admin:", error.message);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();
