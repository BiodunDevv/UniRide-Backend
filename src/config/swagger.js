const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const logger = require("./logger");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "UniRide API Documentation",
    version: "2.3.0",
    description:
      "Secure campus ride-hailing platform with biometric authentication, real-time tracking, and OpenStreetMap integration",
    contact: {
      name: "UniRide Team",
      email: "support@uniride.com",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: `http://${process.env.HOST || "localhost"}:${process.env.PORT || 5000}`,
      description: "Development server",
    },
    {
      url: "https://api.uniride.com",
      description: "Production server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter JWT token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          error: {
            type: "string",
            example: "Error message",
          },
        },
      },
      Success: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: true,
          },
          message: {
            type: "string",
            example: "Operation successful",
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: "Authentication",
      description: "Auth endpoints for login, biometric, password change",
    },
    {
      name: "Admin",
      description:
        "Admin endpoints for colleges, departments, fare policy, driver approvals",
    },
    { name: "College", description: "College management endpoints" },
    { name: "Department", description: "Department management endpoints" },
    {
      name: "Student",
      description: "Student endpoints for bookings, ride history, profile",
    },
    {
      name: "Driver",
      description:
        "Driver endpoints for applications, rides, profile, bank details",
    },
    {
      name: "Ride",
      description:
        "Ride endpoints for nearby rides, active rides, live tracking",
    },
    {
      name: "Booking",
      description: "Booking endpoints for confirmations and payment status",
    },
    { name: "Application", description: "Driver application endpoints" },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/routes/*.js", "./src/models/*.js"], // Path to the API routes and models
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  try {
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "UniRide API Docs",
      })
    );

    // Serve raw swagger JSON
    app.get("/api-docs.json", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerSpec);
    });

    logger.info("Swagger documentation available at /api-docs");
  } catch (error) {
    logger.error(`Error setting up Swagger: ${error.message}`);
  }
};

module.exports = { setupSwagger, swaggerSpec };
