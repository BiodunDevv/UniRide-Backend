require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

// Start server
const startServer = async () => {
  try {
    console.log("🔄 Initializing UniRide Backend...\n");

    // Connect to MongoDB first
    console.log("🔄 Connecting to MongoDB...");
    const connectDB = require("./config/db");
    try {
      await connectDB();
      console.log("✅ MongoDB connected successfully");
    } catch (error) {
      console.error("❌ MongoDB connection failed:", error.message);
      console.warn(
        "⚠️  Starting server without MongoDB. Database operations will fail."
      );
    }

    // Connect to Redis
    console.log("\n🔄 Connecting to Redis...");
    const { connectRedis, getRedisClient } = require("./config/redis");
    let redisConnected = false;
    try {
      await connectRedis();
      const redisClient = getRedisClient();
      console.log("✅ Redis connected successfully");
      redisConnected = true;
    } catch (error) {
      console.error("❌ Redis connection failed:", error.message);
      console.warn(
        "⚠️  Continuing without Redis. Caching and rate limiting will use memory store."
      );
    }

    // Initialize rate limiter with Redis (if available)
    if (redisConnected) {
      const { initializeRedis } = require("./middlewares/rateLimiter");
      initializeRedis();
    }

    // Now load the app (after connections are established)
    console.log("\n🔄 Loading Express application...");
    const app = require("./app");
    const appConfig = require("./config/appConfig");

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.io
    console.log("🔄 Initializing Socket.io...");
    const io = new Server(server, {
      cors: {
        origin: appConfig.corsOrigin,
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Redis adapter for Socket.io (for horizontal scaling)
    if (redisConnected) {
      try {
        const { createAdapter } = require("@socket.io/redis-adapter");
        const { getRedisClient } = require("./config/redis");
        const pubClient = getRedisClient();
        const subClient = pubClient.duplicate();

        // Add error handler to subClient
        subClient.on("error", (err) => {
          console.error("❌ Redis subClient error:", err.message);
        });

        await subClient.connect();

        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ Socket.io Redis adapter configured");
      } catch (error) {
        console.warn("⚠️  Socket.io Redis adapter failed:", error.message);
        console.warn("   Running in single-instance mode.");
      }
    }

    // Socket.io connection handling
    io.on("connection", (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);

      // Join user-specific room
      socket.on("join", (userId) => {
        if (userId) {
          socket.join(`user:${userId}`);
          console.log(`👤 User ${userId} joined their room`);
        }
      });

      // Join ride-specific room
      socket.on("joinRide", (rideId) => {
        if (rideId) {
          socket.join(`ride:${rideId}`);
          console.log(`🚗 Socket ${socket.id} joined ride ${rideId}`);
        }
      });

      // Leave ride room
      socket.on("leaveRide", (rideId) => {
        if (rideId) {
          socket.leave(`ride:${rideId}`);
          console.log(`🚪 Socket ${socket.id} left ride ${rideId}`);
        }
      });

      // Driver location streaming
      socket.on("driverLocationUpdate", (data) => {
        const { rideId, location } = data;
        if (rideId && location) {
          // Broadcast to all students in the ride
          socket.to(`ride:${rideId}`).emit("locationUpdate", {
            rideId,
            location,
            timestamp: new Date(),
          });
        }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
      });

      // Error handling
      socket.on("error", (error) => {
        console.error(`❌ Socket error: ${error.message}`);
      });
    });

    // Make io instance available globally
    global.io = io;

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        console.log("✅ HTTP server closed");

        try {
          // Close Socket.io connections
          io.close(() => {
            console.log("✅ Socket.io connections closed");
          });

          // Close Redis connection
          if (redisConnected) {
            const { getRedisClient } = require("./config/redis");
            const redisClient = getRedisClient();
            await redisClient.quit();
            console.log("✅ Redis connection closed");
          }

          // Close MongoDB connection
          const mongoose = require("mongoose");
          await mongoose.connection.close();
          console.log("✅ MongoDB connection closed");

          process.exit(0);
        } catch (error) {
          console.error("❌ Error during shutdown:", error.message);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error("❌ Forced shutdown after 30 seconds");
        process.exit(1);
      }, 30000);
    };

    // Signal handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Unhandled rejection handler
    process.on("unhandledRejection", (err) => {
      console.error("❌ Unhandled Rejection:", err.message);
      console.error(err.stack);
      gracefulShutdown("unhandledRejection");
    });

    // Uncaught exception handler
    process.on("uncaughtException", (err) => {
      console.error("❌ Uncaught Exception:", err.message);
      console.error(err.stack);
      gracefulShutdown("uncaughtException");
    });

    // Start listening
    const PORT = appConfig.port || 5000;
    server.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${appConfig.nodeEnv || "development"}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
    });

    module.exports = { server, io };
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

// Initialize server
startServer();
