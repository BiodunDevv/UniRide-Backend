const Joi = require("joi");
const logger = require("../config/logger");

/**
 * Validate request body, query, or params using Joi schema
 * @param {object} schema - Joi validation schema
 * @param {string} property - Property to validate (body, query, params)
 */
const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown keys
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      logger.warn(`Validation error on ${property}: ${JSON.stringify(errors)}`);

      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: errors,
      });
    }

    // Replace request property with validated value
    req[property] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Auth
  login: Joi.object({
    identifier: Joi.string().required().messages({
      "string.empty": "Identifier (matric_no or email) is required",
    }),
    password: Joi.string().min(6).required().messages({
      "string.min": "Password must be at least 6 characters",
      "string.empty": "Password is required",
    }),
    device_id: Joi.string().when("userType", {
      is: "student",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }),

  passwordChange: Joi.object({
    current_password: Joi.string().min(6).required(),
    new_password: Joi.string().min(6).required(),
  }),

  biometricAuth: Joi.object({
    matric_no: Joi.string().required(),
    biometric_token: Joi.string().required(),
    device_id: Joi.string().required(),
  }),

  // College
  createCollege: Joi.object({
    name: Joi.string().max(200).required(),
    code: Joi.string().max(20).uppercase().optional(),
  }),

  // Department
  createDepartment: Joi.object({
    name: Joi.string().max(200).required(),
    code: Joi.string().max(20).uppercase().optional(),
    college_id: Joi.string().required(),
  }),

  createAdmin: Joi.object({
    first_name: Joi.string().max(100).required(),
    last_name: Joi.string().max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid("admin", "super_admin").required(),
  }),

  updateFarePolicy: Joi.object({
    mode: Joi.string().valid("admin", "driver", "distance_auto").required(),
    base_fee: Joi.number().min(0).optional(),
    per_meter_rate: Joi.number().min(0).optional(),
  }),

  releaseDevice: Joi.object({}),

  // Driver application
  submitApplication: Joi.object({
    name: Joi.string().max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string()
      .pattern(/^[0-9+\-\s()]+$/)
      .required(),
    vehicle_model: Joi.string().max(100).required(),
    plate_number: Joi.string().max(20).required(),
    available_seats: Joi.number().min(1).max(10).required(),
    license_url: Joi.string().uri().required(),
    vehicle_document_url: Joi.string().uri().required(),
  }),

  uploadStudents: Joi.object({}),

  updateProfile: Joi.object({
    phone: Joi.string()
      .pattern(/^[0-9+\-\s()]+$/)
      .optional(),
    biometric_enabled: Joi.boolean().optional(),
  }),

  updateDriverProfile: Joi.object({
    phone: Joi.string()
      .pattern(/^[0-9+\-\s()]+$/)
      .optional(),
    vehicle_model: Joi.string().max(100).optional(),
    plate_number: Joi.string().max(20).optional(),
    available_seats: Joi.number().min(1).max(10).optional(),
  }),

  // Ride creation
  createRide: Joi.object({
    pickup_location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().optional(),
    }).required(),
    destination: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().optional(),
    }).required(),
    fare: Joi.number().min(0).optional(),
    departure_time: Joi.date().iso().required(),
    available_seats: Joi.number().min(1).max(8).required(),
  }),

  // Booking
  createBooking: Joi.object({
    ride_id: Joi.string().required(),
    no_of_seats: Joi.number().min(1).max(4).required(),
    payment_method: Joi.string().valid("cash", "transfer").required(),
  }),

  // Check-in
  checkIn: Joi.object({
    booking_id: Joi.string().required(),
    code: Joi.string()
      .pattern(/^\d{4}$/)
      .required()
      .messages({
        "string.pattern.base": "Check-in code must be a 4-digit number",
      }),
  }),

  // Bank details
  addBankDetails: Joi.object({
    bank_name: Joi.string().max(100).required(),
    bank_account_number: Joi.string().max(20).required(),
    bank_account_name: Joi.string().max(100).optional(),
  }),

  // Location update
  updateLocation: Joi.object({
    longitude: Joi.number().min(-180).max(180).required(),
    latitude: Joi.number().min(-90).max(90).required(),
  }),

  // Booking
  createBooking: Joi.object({
    ride_id: Joi.string().required(),
  }),

  checkIn: Joi.object({
    check_in_code: Joi.string().length(4).required(),
  }),

  updatePayment: Joi.object({
    payment_method: Joi.string().valid("cash", "transfer").required(),
  }),

  addRating: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    review: Joi.string().max(500).optional(),
  }),

  updateBankDetails: Joi.object({
    bank_name: Joi.string().max(100).required(),
    account_number: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required(),
    account_name: Joi.string().max(100).required(),
  }),
};

// Export individual validation middleware
module.exports = {
  validate,
  schemas,

  // Auth validations
  validateLogin: validate(schemas.login),
  validatePasswordChange: validate(schemas.passwordChange),
  validateBiometricAuth: validate(schemas.biometricAuth),

  // Admin validations
  validateCreateCollege: validate(schemas.createCollege),
  validateCreateDepartment: validate(schemas.createDepartment),
  validateCreateAdmin: validate(schemas.createAdmin),
  validateUpdateFarePolicy: validate(schemas.updateFarePolicy),
  validateReleaseDevice: validate(schemas.releaseDevice),

  // Student validations
  validateUploadStudents: validate(schemas.uploadStudents),
  validateUpdateProfile: validate(schemas.updateProfile),

  // Driver validations
  validateSubmitApplication: validate(schemas.submitApplication),
  validateUpdateDriverProfile: validate(schemas.updateDriverProfile),
  validateUpdateBankDetails: validate(schemas.updateBankDetails),

  // Ride validations
  validateCreateRide: validate(schemas.createRide),
  validateUpdateLocation: validate(schemas.updateLocation),

  // Booking validations
  validateCreateBooking: validate(schemas.createBooking),
  validateCheckIn: validate(schemas.checkIn),
  validateUpdatePayment: validate(schemas.updatePayment),
  validateAddRating: validate(schemas.addRating),
};
