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
const accountDeletionRoutes = require("./routes/accountDeletionRoutes");

const app = express();

function redactValue(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const plainValue =
    typeof value.toObject === "function"
      ? value.toObject({
          depopulate: true,
          flattenMaps: true,
          versionKey: false,
        })
      : value;

  if (!plainValue || typeof plainValue !== "object") {
    return plainValue;
  }

  const clone = Array.isArray(plainValue) ? [...plainValue] : { ...plainValue };
  const sensitiveKeys = [
    "password",
    "token",
    "refresh_token",
    "authorization",
    "pin",
    "current_pin",
    "new_pin",
    "code",
  ];

  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      clone[key] = "***";
    } else {
      clone[key] = redactValue(clone[key], seen);
    }
  }

  return clone;
}

function isBootRoute(url = "") {
  const path = url.split("?")[0];
  return [
    "/api/auth/login",
    "/api/auth/me",
    "/api/platform-settings",
    "/api/driver/profile",
    "/api/driver/online",
    "/api/booking/my-bookings",
    "/api/booking/driver-bookings",
    "/api/rides/my-rides",
  ].includes(path);
}

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

// Logging middleware: keep terminal noise low in normal development.
app.use(
  morgan("dev", {
    skip: (req, res) => res.statusCode < 400 || req.path === "/health",
  }),
);

if (process.env.DEBUG_HTTP === "true") {
  app.use("/api/auth", (req, res, next) => {
    const { method, originalUrl } = req;
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`📥 ${method} ${originalUrl}`, JSON.stringify(redactValue(req.body)));
    }
    next();
  });

  app.use((req, res, next) => {
    if (!isBootRoute(req.originalUrl)) {
      next();
      return;
    }

    console.log(
      `🚦 [BOOT] ${req.method} ${req.originalUrl}`,
      JSON.stringify({
        body: redactValue(req.body || {}),
        user_id: req.user?.id || null,
        role: req.user?.role || null,
      }),
    );
    next();
  });
}

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
app.use("/api/account-deletion", accountDeletionRoutes);

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
