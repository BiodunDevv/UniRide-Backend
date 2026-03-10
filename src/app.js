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
const locationRoutes = require("./routes/locationRoutes");
const platformSettingsRoutes = require("./routes/platformSettingsRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration — allow all origins for mobile + web compatibility
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan("dev"));

// Log request & response bodies for auth routes (debug helper)
app.use("/api/auth", (req, res, next) => {
  const startTime = Date.now();
  const { method, originalUrl } = req;

  // Log request
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = "***";
    console.log(`📥 ${method} ${originalUrl}`, JSON.stringify(safeBody));
  }

  // Capture response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const icon = status >= 400 ? "❌" : "✅";
    console.log(
      `${icon} ${method} ${originalUrl} → ${status} (${duration}ms)`,
      JSON.stringify(body),
    );
    return originalJson(body);
  };

  next();
});

// API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "UniRide API Documentation",
  }),
);
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "UniRide API Documentation",
  }),
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
app.use("/api/locations", locationRoutes);
app.use("/api/platform-settings", platformSettingsRoutes);
app.use("/api/reviews", reviewRoutes);

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
