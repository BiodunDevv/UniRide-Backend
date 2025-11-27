# UniRide Backend

UniRide is a secure campus ride-hailing platform designed for universities and campuses. Students and users can create accounts, request rides, track drivers in real-time, and pay via cash or bank transfer. Drivers apply with ID verification. Super Admins manage platform admins. Features include biometric login, single-device restriction, 4-digit ride check-ins, Redis caching, and OpenStreetMap + OpenRouteService routing.

## 🚀 Features

### Security

- **JWT Authentication** with device-based single-device restriction
- **Biometric Authentication** support
- **First-login password change** enforcement
- **Password hashing** with bcrypt
- **Redis-based rate limiting** to prevent API abuse
- **Helmet.js** for security headers
- **User flagging** system for admin moderation

### Core Functionality

- **User Registration & Login** with email/matric number
- **Driver Application System** with admin approval workflow
- **Real-time Ride Tracking** using Socket.io and GPS
- **4-Digit Check-in Codes** for ride verification
- **Multi-payment Support** (Cash & Bank Transfer)
- **Driver Rating System** (1-5 stars)
- **Fare Management** (Admin-controlled, Driver-set, or Auto-calculated)

### Maps & Routing

- **OpenStreetMap** integration
- **OpenRouteService** for routing, distance, ETA, and geocoding
- **Real-time location updates** during rides
- **Route geometry** visualization support

### Notifications

- **Email notifications** via Brevo (driver approval/rejection, booking confirmation, ride completion)
- **Real-time push notifications** via Socket.io (ride requests, acceptance, driver arrival, ride end)

### API Documentation

- **Swagger/OpenAPI** documentation at `/api-docs`
- Comprehensive endpoint documentation with request/response schemas

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB database
- Redis instance
- Brevo API key
- OpenRouteService API key

## 🛠️ Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd UniRide-Backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

The `.env` file is already configured with your credentials. Key variables:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=your_mongodb_connection_string
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password

JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d

OPENROUTESERVICE_API_KEY=your_ors_api_key
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_sender_email
BREVO_SENDER_NAME=UniRide

FRONTEND_URL=http://localhost:3000

DEFAULT_SUPER_ADMIN_EMAIL=admin@uniride.com
DEFAULT_SUPER_ADMIN_PASSWORD=secure_password
DEFAULT_SUPER_ADMIN_FIRST_NAME=Admin
DEFAULT_SUPER_ADMIN_LAST_NAME=User
```

4. **Start the server**

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## 📚 API Documentation

Once the server is running, access the interactive API documentation at:

```
http://localhost:5000/api-docs
```

## 🔑 API Endpoints Overview

### Authentication (`/api/auth`)

- `POST /register` - User registration
- `POST /login` - Login with email/password + device_id
- `POST /biometric` - Biometric authentication
- `POST /logout` - Logout and free device_id
- `PATCH /change-password` - Change password (required on first login)
- `PATCH /enable-biometric` - Enable biometric auth
- `GET /me` - Get current user profile

### Driver (`/api/driver`)

- `POST /apply` - Submit driver application
- `GET /status` - Check application status
- `GET /profile` - Get driver profile
- `PATCH /profile` - Update profile or add bank info
- `PATCH /toggle-status` - Toggle availability (active/inactive)

### Admin (`/api/admin`)

- `POST /create` - Create admin account (Super Admin only)
- `GET /drivers/pending` - Get pending applications
- `GET /drivers/all` - Get all applications
- `PATCH /drivers/approve/:id` - Approve driver
- `PATCH /drivers/reject/:id` - Reject driver
- `GET /drivers/list` - Get all approved drivers
- `GET /fare-policy` - Get current fare policy
- `PATCH /fare-policy` - Update fare policy
- `PATCH /users/flag/:id` - Flag/unflag user

### Rides (`/api/rides`)

- `POST /` - Create new ride (Driver only)
- `GET /active` - Get all active rides
- `GET /my-rides` - Get driver's rides
- `GET /:id` - Get ride details
- `POST /:id/location` - Update driver GPS location
- `POST /:id/end` - End ride

### Booking (`/api/booking`)

- `POST /request` - Request ride booking
- `POST /confirm/:id` - Confirm booking (Driver accepts)
- `POST /checkin` - Check in with 4-digit code
- `PATCH /payment-status` - Update payment status
- `POST /rate` - Rate driver after completion
- `GET /my-bookings` - Get user's bookings
- `PATCH /cancel/:id` - Cancel booking

## 🎯 User Flows

### Driver Onboarding

1. User applies via frontend, uploads license to Cloudinary
2. Application stored as 'pending', admin notified
3. Admin reviews and approves/rejects
4. Driver receives email with login credentials (first name as password)
5. Driver logs in, forced to change password
6. Driver adds bank info later (displayed only after booking confirmation)

### Ride Flow

1. User requests ride (pickup & destination)
2. All available drivers notified via Socket.io
3. First driver to accept gets assigned
4. User sees driver info and bank details for payment
5. User pays via cash or bank transfer
6. User enters 4-digit code at pickup to start ride
7. Live tracking via OpenStreetMap + Socket.io
8. Driver clicks 'End Ride'
9. Ride marked completed, payment & ratings updated

## 🔒 Security Features

- **Single-Device Restriction**: Users can only be logged in on one device at a time
- **Biometric Authentication**: Optional biometric login support
- **First Login Password Change**: Drivers must change default password
- **JWT Tokens**: Secure token-based authentication
- **Rate Limiting**: Redis-based rate limiting to prevent abuse
- **Input Validation**: All inputs validated and sanitized
- **Password Hashing**: Bcrypt with salt rounds
- **User Flagging**: Admins can flag problematic users

## 🗺️ Maps & Routing

The platform uses **OpenRouteService** for:

- Route calculation between pickup and destination
- Distance calculation (meters)
- Duration estimation (seconds)
- Geocoding (address to coordinates)
- Reverse geocoding (coordinates to address)

Real-time tracking uses **Socket.io** to stream driver location updates to users.

## 📧 Email Templates

Located in `src/emails/`:

- `driverApproval.html` - Driver approval with credentials
- `driverRejection.html` - Driver rejection with reason
- `rideConfirmation.html` - Booking confirmation with check-in code
- `rideCompletion.html` - Ride completion receipt
- `missedRide.html` - Missed ride notification

## 🚀 Deployment

The backend can be deployed to:

- **Render**
- **Railway**
- **AWS** (EC2, ECS, Lambda)
- **Heroku**
- **DigitalOcean**

### Environment Variables for Production

Ensure all environment variables are properly set in your deployment platform, especially:

- `NODE_ENV=production`
- Database credentials
- Redis credentials
- API keys
- Frontend URL for CORS

## 🧪 Testing

```bash
npm test
```

## 📝 Project Structure

```
UniRide-Backend/
├── src/
│   ├── config/          # Configuration files (DB, Redis, Brevo, ORS, Swagger)
│   ├── controllers/     # Route controllers
│   ├── emails/          # Email templates
│   ├── middlewares/     # Express middlewares
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   ├── app.js           # Express app setup
│   └── server.js        # Server entry point
├── .env                 # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## 👥 User Roles

- **user**: Regular users who book rides
- **driver**: Approved drivers who offer rides
- **admin**: Platform administrators who manage drivers
- **super_admin**: Super administrators who can create admins

## 🔄 Fare Policy Modes

1. **Admin-controlled**: Admin sets fare per route or flat rate (default)
2. **Driver-settable**: Drivers can set their own fare (future toggle)
3. **Auto-calculate by distance**: Fare calculated using distance and duration

## 📊 Real-time Features

Socket.io events:

- `new-ride-request` - Broadcast to available drivers
- `ride-accepted` - Notify user of driver acceptance
- `booking-confirmed` - Notify driver of booking confirmation
- `driver-arrived` - Notify user of driver arrival
- `driver-location-update` - Real-time GPS updates
- `ride-ended` - Notify both parties of ride completion
- `ride-cancelled` - Notify of cancellation

## 🛡️ Rate Limiting

- **Auth endpoints**: 5 requests per 15 minutes
- **API endpoints**: 100 requests per 15 minutes
- **Strict endpoints**: 10 requests per minute

## 📄 License

MIT

## 👨‍💻 Support

For issues or questions, please contact the development team.

---

**Built with ❤️ for UniRide**
