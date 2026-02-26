const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "UniRide API",
      version: "2.0.0",
      description:
        "Secure Campus Ride-Hailing Platform — REST API Documentation",
      contact: {
        name: "UniRide Team",
        email: process.env.BREVO_SENDER_EMAIL,
      },
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? "https://api.uniride.com"
            : `http://localhost:${process.env.PORT || 5000}`,
        description:
          process.env.NODE_ENV === "production"
            ? "Production Server"
            : "Development Server",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication & account management" },
      {
        name: "Auth - Security",
        description: "Biometric, PIN, and device security",
      },
      {
        name: "Auth - Notifications",
        description: "User in-app notification management",
      },
      { name: "Driver", description: "Driver profile, rides, and earnings" },
      { name: "Admin", description: "Admin dashboard and management" },
      { name: "Rides", description: "Ride creation and management" },
      { name: "Bookings", description: "Ride booking management" },
      { name: "Support", description: "Support ticket system" },
      {
        name: "Settings - Notifications",
        description: "User notification preferences",
      },
      {
        name: "Settings - Push Tokens",
        description: "Expo push token registration",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT token",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/models/*.js", "./src/controllers/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
