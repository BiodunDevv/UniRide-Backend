const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const errorHandler = require("./middlewares/errorHandler");

// Import routes
const authRoutes = require("./routes/authRoutes");
const driverRoutes = require("./routes/driverRoutes");
const adminRoutes = require("./routes/adminRoutes");
const rideRoutes = require("./routes/rideRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const supportRoutes = require("./routes/supportRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  "https://uniridee.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://172.20.10.6:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, curl, Swagger UI)
      if (!origin) return callback(null, true);

      // Allow all localhost origins in development
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // Don't throw error, just log and deny
        console.warn(`CORS blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "UniRide API Documentation",
  })
);
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "UniRide API Documentation",
  })
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UniRide API is running",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/settings", settingsRoutes);

// Welcome route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to UniRide API",
    version: "1.0.0",
    documentation: {
      swagger: "/api-docs",
      docs: "/docs",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
