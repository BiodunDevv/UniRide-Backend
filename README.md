# UniRide Backend - Version 2.3

**Secure campus ride-hailing platform for universities**

UniRide is a comprehensive ride-hailing solution designed specifically for university campuses. It features biometric authentication, single-device restriction, real-time tracking with OpenStreetMap + OpenRouteService, 4-digit ride check-ins, admin-controlled fares, driver onboarding with document upload, and secure payment handling.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Key Features Explained](#key-features-explained)
- [Security](#security)
- [Deployment](#deployment)
- [Contributing](#contributing)

## ✨ Features

### Core Features
- **Biometric Authentication** - Secure login with fingerprint/face ID support
- **Single-Device Lock** - Each account bound to one device for security
- **Real-time Tracking** - Live driver location via Socket.io and OpenStreetMap
- **4-Digit Check-in Codes** - Secure ride verification system
- **Admin Fare Control** - Flexible fare policies (admin-set, driver-set, or distance-based)
- **Driver Onboarding** - Complete application and approval workflow
- **Bank Details Management** - Secure driver payment info (visible only after booking)
- **Redis Caching** - Hot endpoint caching for optimal performance
- **Email Notifications** - Brevo-powered transactional emails
- **Audit Logging** - Complete admin action tracking
- **Swagger API Documentation** - Interactive API explorer at `/api-docs`

### User Roles
1. **Super Admin** - Full system control
2. **Admin** - Manage colleges, departments, drivers, fares
3. **Student** - Book rides, track drivers, rate experiences
4. **Driver** - Create rides, manage bookings, update location

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Database** | MongoDB with Mongoose ODM |
| **Real-time** | Socket.io (WebSockets) |
| **Cache** | Redis |
| **Authentication** | JWT + bcrypt |
| **Maps & Routing** | OpenRouteService + OpenStreetMap |
| **File Storage** | Cloudinary (frontend upload) |
| **Email** | Brevo API |
| **Documentation** | Swagger (swagger-jsdoc + swagger-ui-express) |
| **Logging** | Winston with daily rotation |

## 📦 Prerequisites

Before you begin, ensure you have:

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **MongoDB** >= 5.0 (local or Atlas)
- **Redis** >= 6.0 (local or cloud)
- **OpenRouteService API Key** - [Get here](https://openrouteservice.org/)
- **Brevo API Key** - [Get here](https://www.brevo.com/)
- **Cloudinary Account** - [Sign up](https://cloudinary.com/) (optional, for file uploads)

## 🚀 Installation

### 1. Clone or Extract the Project

```cmd
cd "c:\Users\muham\Desktop\UNIRIDE\UniRide Backend"
```

### 2. Install Dependencies

```cmd
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```cmd
copy .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

### 4. Start MongoDB

Ensure MongoDB is running:

```cmd
# If using local MongoDB
net start MongoDB

# Or if using Docker
docker start mongodb
```

### 5. Start Redis

Ensure Redis is running:

```cmd
# If using local Redis
redis-server

# Or if using Docker
docker start redis
```

## ⚙ Configuration

### Environment Variables

Edit the `.env` file with your configuration:

```env
# Server
NODE_ENV=development
PORT=5000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/uniride

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d

# OpenRouteService
ORS_API_KEY=your_openrouteservice_api_key
ORS_BASE_URL=https://api.openrouteservice.org

# Brevo
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@uniride.com
BREVO_SENDER_NAME=UniRide

# Fare Policy
FARE_POLICY_MODE=admin
# Options: admin, driver, distance_auto
FARE_BASE_FEE=500
FARE_PER_METER_RATE=2.5
DEFAULT_FARE=1000

# Ride Configuration
RIDE_SEARCH_RADIUS_KM=5
DRIVER_ACCEPT_WINDOW_SECONDS=20
MAX_BOOKING_SEATS=4

# CORS
CORS_ORIGIN=http://localhost:3000
```

### API Keys Setup

1. **OpenRouteService**:
   - Sign up at https://openrouteservice.org/
   - Get your free API key (limit: 2000 requests/day)
   - Add to `ORS_API_KEY` in `.env`

2. **Brevo (Sendinblue)**:
   - Create account at https://www.brevo.com/
   - Generate API key from Settings > API Keys
   - Add to `BREVO_API_KEY` in `.env`

3. **Cloudinary** (Optional):
   - Files are uploaded from frontend directly
   - Backend only stores returned URLs

## 🏃 Running the Application

### Development Mode (with auto-reload)

```cmd
npm run dev
```

### Production Mode

```cmd
npm start
```

### Run with Seed Data

```cmd
npm run seed
```

This creates:
- Super admin account
- Sample colleges and departments
- Test student accounts

### The server will start on:
- **API**: `http://localhost:5000`
- **Swagger Docs**: `http://localhost:5000/api-docs`
- **Socket.io**: `ws://localhost:5000`

## 📚 API Documentation

### Accessing Swagger UI

Once the server is running, visit:

```
http://localhost:5000/api-docs
```

### Main Endpoint Groups

| Group | Base Path | Description |
|-------|-----------|-------------|
| **Authentication** | `/api/auth` | Login, biometric, password change |
| **Admin** | `/api/admin` | Colleges, departments, driver approvals, fare policy |
| **College** | `/api/colleges` | College management |
| **Department** | `/api/departments` | Department management |
| **Student** | `/api/student` | Profile, bookings, ride history |
| **Driver** | `/api/driver` | Applications, rides, bank details |
| **Ride** | `/api/rides` | Create, list, track rides |
| **Booking** | `/api/booking` | Confirm bookings, payments |

### Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Example API Calls

**Login (Student)**:
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "identifier": "ABC/2020/12345",
  "password": "123456",
  "device_id": "device-unique-id-123"
}
```

**Create Ride (Driver)**:
```bash
POST http://localhost:5000/api/rides
Authorization: Bearer <driver_token>
Content-Type: application/json

{
  "pickup_location": {
    "coordinates": [7.4893, 9.0765],
    "address": "Main Gate, University Campus"
  },
  "destination": {
    "coordinates": [7.5012, 9.0823],
    "address": "Student Hostel Area"
  },
  "departure_time": "2025-11-25T14:00:00Z",
  "available_seats": 4
}
```

## 📁 Project Structure

```
UniRide Backend/
├── src/
│   ├── config/               # Configuration files
│   │   ├── appConfig.js      # App-wide settings
│   │   ├── db.js             # MongoDB connection
│   │   ├── redis.js          # Redis connection
│   │   ├── ors.js            # OpenRouteService config
│   │   ├── brevo.js          # Brevo email config
│   │   ├── swagger.js        # Swagger setup
│   │   └── logger.js         # Winston logger
│   │
│   ├── models/               # Mongoose schemas
│   │   ├── Admin.js
│   │   ├── Student.js
│   │   ├── Driver.js
│   │   ├── Ride.js
│   │   ├── Booking.js
│   │   ├── Application.js
│   │   ├── College.js
│   │   └── Department.js
│   │
│   ├── controllers/          # Request handlers
│   │   ├── authController.js
│   │   ├── adminController.js
│   │   ├── studentController.js
│   │   ├── driverController.js
│   │   ├── rideController.js
│   │   ├── bookingController.js
│   │   ├── collegeController.js
│   │   ├── departmentController.js
│   │   └── applicationController.js
│   │
│   ├── routes/               # API routes
│   │   ├── authRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── studentRoutes.js
│   │   ├── driverRoutes.js
│   │   ├── rideRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── collegeRoutes.js
│   │   ├── departmentRoutes.js
│   │   └── applicationRoutes.js
│   │
│   ├── services/             # Business logic
│   │   ├── emailService.js   # Brevo email integration
│   │   ├── orsService.js     # OpenRouteService wrapper
│   │   ├── cacheService.js   # Redis caching
│   │   ├── notificationService.js # Socket.io notifications
│   │   └── auditService.js   # Audit logging
│   │
│   ├── middlewares/          # Express middlewares
│   │   ├── authMiddleware.js      # JWT verification
│   │   ├── roleMiddleware.js      # Role-based access
│   │   ├── deviceLockMiddleware.js # Device binding
│   │   ├── validateMiddleware.js   # Request validation
│   │   ├── errorHandler.js        # Global error handler
│   │   └── rateLimiter.js         # Rate limiting
│   │
│   ├── utils/                # Helper functions
│   │   ├── generateCheckInCode.js
│   │   ├── fareCalculator.js
│   │   ├── validators.js
│   │   ├── pagination.js
│   │   └── geoHelpers.js
│   │
│   ├── email_templates/      # HTML email templates
│   │   ├── driver_approval.html
│   │   ├── driver_rejection.html
│   │   ├── booking_confirmation.html
│   │   ├── ride_completion.html
│   │   └── ...
│   │
│   ├── app.js                # Express app setup
│   └── server.js             # Server + Socket.io entry point
│
├── scripts/
│   ├── seed.js               # Database seeding
│   └── migrations.js         # Database migrations
│
├── logs/                     # Application logs
├── docs/                     # Additional documentation
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🔑 Key Features Explained

### 1. Single-Device Lock

- Each student account can only be used on one device
- Device ID is bound on first login
- Admin can release device binding if needed
- Prevents account sharing

### 2. Biometric Authentication

- Mobile clients handle biometric (fingerprint/face ID)
- Backend validates biometric token
- Falls back to password if biometric unavailable

### 3. 4-Digit Check-in System

- Driver generates a 4-digit code at pickup
- Student enters code to confirm boarding
- Code expires after 10 minutes (configurable)
- Driver can rotate code anytime

### 4. Fare Policy Modes

**Admin Mode** (Default):
- Admin sets fixed fare per route or default fare
- Stored when ride is created

**Driver Mode** (Optional toggle):
- Driver sets fare at ride creation
- Useful for flexible pricing

**Distance Auto Mode** (Optional toggle):
- Fare calculated automatically: `base_fee + (distance_meters × per_meter_rate)`
- Uses OpenRouteService distance API

### 5. Real-time Tracking

- Driver streams location via Socket.io
- Students subscribe to `ride:<ride_id>` room
- Backend broadcasts location updates
- Frontend displays on OpenStreetMap tiles

### 6. Redis Caching Strategy

Cached endpoints with TTL:
- `GET /api/rides/nearby` - 5-10s
- `GET /api/rides/active` - 3-10s
- `GET /api/admin/overview` - 30-60s
- ORS direction requests - 300s

### 7. Driver Onboarding Flow

1. **Apply**: Driver submits application with license image (Cloudinary URL)
2. **Review**: Admin reviews documents
3. **Approve/Reject**: Admin decision triggers email with credentials
4. **First Login**: Driver must change password (default = first name)
5. **Add Bank Details**: Driver adds bank info post-approval
6. **Go Active**: Driver status becomes 'active'

## 🔒 Security

### Implemented Security Measures

✅ **Password Hashing** - bcrypt with 12 rounds  
✅ **JWT Authentication** - Secure token-based auth  
✅ **Rate Limiting** - Redis-backed rate limiter  
✅ **Input Validation** - Joi schema validation  
✅ **Mongo Sanitization** - Prevent NoSQL injection  
✅ **XSS Protection** - xss-clean middleware  
✅ **HPP Protection** - Prevent HTTP parameter pollution  
✅ **Helmet** - Security headers  
✅ **CORS** - Configurable origins  
✅ **Device Binding** - Single device per student  
✅ **Audit Logging** - Track all admin actions  

### Best Practices

- Never commit `.env` file
- Rotate JWT secrets regularly
- Use HTTPS in production
- Keep dependencies updated
- Monitor audit logs

## 🚢 Deployment

### Deploy to Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Set environment variables
5. Deploy

```bash
Build Command: npm install
Start Command: npm start
```

### Deploy to Railway

1. Install Railway CLI: `npm i -g railway`
2. Login: `railway login`
3. Initialize: `railway init`
4. Add MongoDB and Redis plugins
5. Deploy: `railway up`

### Deploy to AWS

See `docs/deployment.md` for detailed AWS deployment guide.

### Environment Variables for Production

Ensure these are set:
- `NODE_ENV=production`
- `MONGODB_URI=<production_mongodb_url>`
- `REDIS_HOST=<production_redis_host>`
- `JWT_SECRET=<strong_random_secret>`
- `ORS_API_KEY=<your_key>`
- `BREVO_API_KEY=<your_key>`
- `CORS_ORIGIN=<your_frontend_urls>`

## 📊 Performance Optimization

- **Redis caching** on hot endpoints
- **Database indexing** on frequent queries
- **Geospatial indexes** for location-based queries
- **Connection pooling** for MongoDB
- **Rate limiting** to prevent abuse
- **Log rotation** with Winston daily rotate

## 🧪 Testing

```cmd
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with nodemon |
| `npm run seed` | Seed database with initial data |
| `npm run migrate` | Run database migrations |
| `npm test` | Run test suite |
| `npm run lint` | Lint code with ESLint |
| `npm run format` | Format code with Prettier |

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Commit changes: `git commit -m 'Add AmazingFeature'`
4. Push to branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👥 Team

UniRide Development Team

## 📞 Support

For issues or questions:
- Email: support@uniride.com
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)

## 🗺 Roadmap

- [ ] Payment gateway integration (Paystack/Flutterwave)
- [ ] FCM push notifications
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] In-app chat between student and driver
- [ ] Scheduled rides
- [ ] Ride sharing optimization algorithm

---

**Built with ❤️ for safer campus transportation**
