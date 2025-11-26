const axios = require('axios');
const logger = require('./logger');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3';

if (!BREVO_API_KEY) {
  logger.warn('BREVO_API_KEY not set. Email features will not work.');
}

// Create axios instance for Brevo API
const brevoClient = axios.create({
  baseURL: BREVO_API_URL,
  headers: {
    'api-key': BREVO_API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor
brevoClient.interceptors.request.use(
  (config) => {
    logger.debug(`Brevo Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error(`Brevo Request Error: ${error.message}`);
    return Promise.reject(error);
  }
);

// Response interceptor
brevoClient.interceptors.response.use(
  (response) => {
    logger.info(`Brevo email sent successfully`);
    return response;
  },
  (error) => {
    if (error.response) {
      logger.error(`Brevo API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`Brevo Network Error: No response received`);
    } else {
      logger.error(`Brevo Error: ${error.message}`);
    }
    return Promise.reject(error);
  }
);

const brevoConfig = {
  client: brevoClient,
  apiKey: BREVO_API_KEY,
  apiUrl: BREVO_API_URL,
  senderEmail: process.env.BREVO_SENDER_EMAIL || 'noreply@uniride.com',
  senderName: process.env.BREVO_SENDER_NAME || 'UniRide',
  
  // Email endpoints
  endpoints: {
    sendTransactionalEmail: '/smtp/email',
    sendTemplateEmail: '/smtp/email',
  },
};

module.exports = brevoConfig;
