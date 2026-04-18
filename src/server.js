require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { setSocketIO } = require("./services/notificationService");
const { setIO } = require("./utils/socketManager");
const { initializeSupportSocket } = require("./socket/supportSocket");
const { startRideScheduler } = require("./services/rideScheduler");
const {
  startDriverPresenceScheduler,
} = require("./services/driverPresenceScheduler");
const {
  startAccountDeletionScheduler,
} = require("./services/accountDeletionScheduler");
const User = require("./models/User");

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = require("socket.io")(server, {
  cors: {
    origin: true,
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
        `✅ User ${user_id} (${role}) joined room: ${role}-${user_id}`,
      );
    }
  });

  // Handle joining the live-map room (for users and admins who want live driver locations)
  socket.on("join-live-map", () => {
    socket.join("live-map");
    console.log(`🗺️ Socket ${socket.id} joined live-map room`);
  });

  socket.on("leave-live-map", () => {
    socket.leave("live-map");
  });

  // Handle drivers joining available-drivers room
  socket.on("driver-available", (data) => {
    const { driver_id } = data;
    socket.join("available-drivers");
    socket.join(`driver-tracking-${driver_id}`);
    console.log(`🚗 Driver ${driver_id} joined available-drivers room`);
  });

  // Handle drivers leaving available-drivers room
  socket.on("driver-unavailable", (data) => {
    const { driver_id } = data;
    socket.leave("available-drivers");
    socket.leave(`driver-tracking-${driver_id}`);
    console.log(`🚗 Driver ${driver_id} left available-drivers room`);
  });

  // Handle real-time driver location streaming (from driver's device)
  socket.on("driver-location-stream", (data) => {
    const { driver_id, latitude, longitude, heading } = data;
    const timestamp = new Date();
    const payload = {
      driver_id,
      location: { latitude, longitude },
      latitude,
      longitude,
      heading: heading || 0,
      timestamp,
      ride_id: data.ride_id,
    };
    // Broadcast to live-map viewers (users + admin)
    io.to("live-map").emit("driver-location-updated", payload);
    // Also broadcast to ride-specific room if active
    if (data.ride_id) {
      io.to(`ride-${data.ride_id}`).emit("driver-location-update", payload);
      io.to(`ride-${data.ride_id}`).emit("driver-location-updated", payload);
    }
  });

  // Handle joining a specific ride room
  socket.on("join-ride", (data) => {
    const { ride_id } = data;
    if (ride_id) {
      socket.join(`ride-${ride_id}`);
      console.log(`🚗 Socket ${socket.id} joined ride-${ride_id}`);
    }
  });

  socket.on("leave-ride", (data) => {
    const { ride_id } = data;
    if (ride_id) socket.leave(`ride-${ride_id}`);
  });

  // Handle joining the drivers feed (all online drivers see new ride requests)
  socket.on("join-driver-feed", () => {
    socket.join("driver-feed");
    console.log(`📡 Socket ${socket.id} joined driver-feed`);
  });

  socket.on("leave-driver-feed", () => {
    socket.leave("driver-feed");
  });

  // Handle joining user's personal booking feed
  socket.on("join-user-feed", (data) => {
    const { user_id } = data;
    if (user_id) {
      socket.join(`user-feed-${user_id}`);
      console.log(`📡 User ${user_id} joined user-feed`);
    }
  });

  // Handle real-time location updates (legacy - for active rides)
  socket.on("update-location", (data) => {
    const { ride_id, latitude, longitude } = data;
    const timestamp = new Date();
    const payload = {
      ride_id,
      location: { latitude, longitude },
      latitude,
      longitude,
      timestamp,
    };
    // Broadcast to users in this ride
    io.to(`ride-${ride_id}`).emit("driver-location-update", payload);
    io.to(`ride-${ride_id}`).emit("driver-location-updated", payload);
  });

  // Handle real-time passenger location streaming
  socket.on("passenger-location-stream", (data) => {
    const { user_id, ride_id, latitude, longitude, name, profile_picture } =
      data;
    const timestamp = new Date();
    if (ride_id) {
      io.to(`ride-${ride_id}`).emit("passenger-location-updated", {
        user_id,
        location: { latitude, longitude },
        name: name || "Passenger",
        profile_picture: profile_picture || null,
        timestamp,
      });
      io.to("live-map").emit("active-rider-location-updated", {
        user_id,
        ride_id,
        name: name || "Passenger",
        profile_picture: profile_picture || null,
        location: { latitude, longitude },
        last_updated_at: timestamp,
      });
    }
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

    // Start ride expiry scheduler
    startRideScheduler();
    startDriverPresenceScheduler();
    startAccountDeletionScheduler();

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
