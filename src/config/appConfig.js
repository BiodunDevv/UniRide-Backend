require('dotenv').config();

const appConfig = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 5000,
  host: process.env.HOST || 'localhost',
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret_change_in_production',
    expire: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },
  
  // Security
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  maxDeviceBindAttempts: parseInt(process.env.MAX_DEVICE_BIND_ATTEMPTS) || 3,
  
  // Fare Policy
  farePolicy: {
    mode: process.env.FARE_POLICY_MODE || 'admin', // admin, driver, distance_auto
    baseFee: parseFloat(process.env.FARE_BASE_FEE) || 500,
    perMeterRate: parseFloat(process.env.FARE_PER_METER_RATE) || 2.5,
    defaultFare: parseFloat(process.env.DEFAULT_FARE) || 1000,
  },
  
  // Ride Configuration
  ride: {
    searchRadiusKm: parseFloat(process.env.RIDE_SEARCH_RADIUS_KM) || 5,
    driverAcceptWindowSeconds: parseInt(process.env.DRIVER_ACCEPT_WINDOW_SECONDS) || 20,
    maxBookingSeats: parseInt(process.env.MAX_BOOKING_SEATS) || 4,
    checkInCodeExpirySeconds: parseInt(process.env.CHECK_IN_CODE_EXPIRY_SECONDS) || 600,
  },
  
  // Cache TTL
  cache: {
    nearbyRidesTTL: parseInt(process.env.CACHE_NEARBY_RIDES_TTL) || 10,
    activeRidesTTL: parseInt(process.env.CACHE_ACTIVE_RIDES_TTL) || 5,
    adminOverviewTTL: parseInt(process.env.CACHE_ADMIN_OVERVIEW_TTL) || 60,
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  },
  
  // File Upload
  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB) || 5,
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
  },
  
  // Default Passwords
  defaults: {
    adminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@uniride.com',
    adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456',
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'superadmin@uniride.com',
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123456',
    studentPassword: process.env.DEFAULT_STUDENT_PASSWORD || '123456',
    driverPasswordUseFirstname: process.env.DRIVER_DEFAULT_PASSWORD_USE_FIRSTNAME === 'true',
  },
  
  // Features
  features: {
    enablePushNotifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
    enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    enablePrometheus: process.env.ENABLE_PROMETHEUS === 'false',
  },
  
  // Socket.io
  socket: {
    corsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
  },
  
  // Deployment
  deployment: {
    platform: process.env.DEPLOYMENT_PLATFORM || 'render',
  },
  
  // Student validation
  student: {
    allowedLevels: [100, 200, 300, 400, 500, 600],
  },
};

module.exports = appConfig;
