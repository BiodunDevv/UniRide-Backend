const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "UniRide API Documentation",
      version: "1.0.0",
      description: "Secure Campus Ride-Hailing Platform API",
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
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/models/*.js", "./src/controllers/*.js"], // Path to files with Swagger annotations
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
