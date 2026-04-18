<p align="center">
  <img src="../uniride/assets/images/icon.png" alt="UniRide Logo" width="120" height="120" />
</p>

<h1 align="center">UniRide Backend API</h1>

<p align="center">
  Secure backend and realtime engine for UniRide campus ride-hailing operations.
</p>

## Overview

UniRide Backend powers authentication, role-based access control, ride lifecycle management,
booking, location services, admin operations, support workflows, platform settings, and
notification delivery for both mobile and web clients.

Key client integrations:

- Mobile app in `../uniride`
- Web dashboard in `../UniRide-Web`

## Core Capabilities

- JWT authentication with device/session controls.
- Role-aware access for user, driver, admin, and super_admin.
- Driver onboarding and application review workflows.
- Ride and booking lifecycle management with check-in flows.
- Realtime Socket.IO feeds for map presence and ride state updates.
- Platform settings API for mobile feature toggles and map behavior.
- Support ticket and account deletion workflows.
- Broadcast and notification infrastructure for ride and system events.
- API documentation through Swagger UI.

## Stack

- Node.js + Express
- MongoDB with Mongoose
- Redis (caching/rate-limiting/supporting infra)
- Socket.IO for realtime communication
- Swagger (OpenAPI docs)
- Brevo email integration
- OpenRouteService for map/geocoding/routing support

## Service Architecture

### Entry Points

- `src/server.js`: server bootstrap, Socket.IO setup, schedulers, DB/Redis startup.
- `src/app.js`: Express middleware pipeline, route mounting, docs, and error handling.

### Domain Layers

- `src/routes`: HTTP route declarations by domain.
- `src/controllers`: request handlers and orchestration.
- `src/services`: shared business logic modules.
- `src/models`: Mongoose schemas.
- `src/middlewares`: auth/validation/error pipeline.
- `src/config`: DB, Redis, external provider config, Swagger.
- `src/socket`: support-focused socket namespace setup.

## API Surface

Mounted route groups:

| Prefix                   | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `/api/auth`              | Registration, login, profile, sessions, authentication actions   |
| `/api/driver`            | Driver profile, status, application lifecycle, driver operations |
| `/api/admin`             | Admin workflows, moderation, policy and management endpoints     |
| `/api/rides`             | Ride creation, retrieval, updates, lifecycle operations          |
| `/api/booking`           | Booking creation, confirmation, check-in, payment/status updates |
| `/api/support`           | Support requests and support operations                          |
| `/api/settings`          | User/device/notification settings                                |
| `/api/locations`         | Location query and related geospatial endpoints                  |
| `/api/platform-settings` | Cross-platform feature toggles and runtime settings              |
| `/api/reviews`           | Review and rating endpoints                                      |
| `/api/account-deletion`  | Account deletion requests and processing                         |

Documentation endpoints:

- `/api-docs`
- `/docs`

Health endpoint:

- `/health`

## Realtime (Socket.IO)

Socket behavior includes:

- Room joins for role/user sessions (`join-room`).
- Live map subscriptions (`join-live-map`, `leave-live-map`).
- Driver availability channels (`driver-available`, `driver-unavailable`).
- Ride room subscriptions (`join-ride`, `leave-ride`).
- Driver feed and user feed channels for dynamic updates.
- Passenger and driver location streaming events.

Common emitted events include:

- `platform-settings:updated`
- `driver-online`
- `driver-offline`
- `driver-location-updated`
- `driver-location-update`
- `passenger-location-updated`
- `active-rider-location-updated`

## Security and Reliability

- Helmet security headers.
- CORS enabled for web and mobile clients.
- Input validation and centralized error handling.
- Password hashing and token-based auth.
- Optional request/body redaction in debug HTTP logs.
- Redis-backed reliability support and performance improvements.
- Background schedulers for ride/account-deletion lifecycle tasks.

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB instance
- Redis instance
- OpenRouteService API key
- Brevo API key (if transactional email is enabled)

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Create `.env` from your secure environment source

3. Start development server

```bash
npm run dev
```

4. Confirm health and docs

- `http://localhost:5000/health`
- `http://localhost:5000/api-docs`

## Environment Variables

Configure the following in `.env`:

| Variable                         | Required                        | Purpose                                            |
| -------------------------------- | ------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                       | Recommended                     | Runtime mode (`development` or `production`)       |
| `PORT`                           | Optional                        | HTTP server port (default: `5000`)                 |
| `MONGODB_URI`                    | Yes                             | MongoDB connection string                          |
| `REDIS_HOST`                     | Yes                             | Redis host                                         |
| `REDIS_PORT`                     | Yes                             | Redis port                                         |
| `REDIS_PASSWORD`                 | If secured Redis                | Redis password                                     |
| `JWT_SECRET`                     | Yes                             | JWT signing secret                                 |
| `JWT_EXPIRE`                     | Recommended                     | JWT expiry window                                  |
| `DEFAULT_SUPER_ADMIN_EMAIL`      | Recommended                     | Auto-bootstrap super admin email                   |
| `DEFAULT_SUPER_ADMIN_PASSWORD`   | Recommended                     | Auto-bootstrap super admin password                |
| `DEFAULT_SUPER_ADMIN_FIRST_NAME` | Recommended                     | Auto-bootstrap super admin first name              |
| `DEFAULT_SUPER_ADMIN_LAST_NAME`  | Recommended                     | Auto-bootstrap super admin last name               |
| `OPENROUTESERVICE_API_KEY`       | Yes                             | Routing/geocoding provider key                     |
| `BREVO_API_KEY`                  | If email enabled                | Brevo API key                                      |
| `BREVO_SENDER_EMAIL`             | If email enabled                | Sender address for transactional mail              |
| `BREVO_SENDER_NAME`              | If email enabled                | Sender display name                                |
| `PAYSTACK_SECRET_KEY`            | If payment integrations enabled | Paystack secret key                                |
| `TRANSLATOR_API_KEY`             | Optional                        | Translator service key                             |
| `TRANSLATOR_ENDPOINT`            | Optional                        | Translator endpoint                                |
| `TRANSLATOR_REGION`              | Optional                        | Translator region                                  |
| `EXPO_ACCESS_TOKEN`              | Optional                        | Expo API token for selected push workflows         |
| `DEBUG_HTTP`                     | Optional                        | Enable verbose, redacted boot/auth request logging |

Example:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb://localhost:27017/uniride
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=replace_with_secure_secret
JWT_EXPIRE=7d

DEFAULT_SUPER_ADMIN_EMAIL=admin@uniride.local
DEFAULT_SUPER_ADMIN_PASSWORD=ChangeMeNow
DEFAULT_SUPER_ADMIN_FIRST_NAME=Platform
DEFAULT_SUPER_ADMIN_LAST_NAME=Admin

OPENROUTESERVICE_API_KEY=replace_with_ors_key

BREVO_API_KEY=replace_with_brevo_key
BREVO_SENDER_EMAIL=noreply@uniride.com
BREVO_SENDER_NAME=UniRide

PAYSTACK_SECRET_KEY=replace_with_paystack_secret

TRANSLATOR_API_KEY=
TRANSLATOR_ENDPOINT=
TRANSLATOR_REGION=

EXPO_ACCESS_TOKEN=
DEBUG_HTTP=false
```

## NPM Scripts

| Command                                     | Description                                                          |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                               | Start backend with nodemon                                           |
| `npm start`                                 | Start backend in normal node runtime                                 |
| `npm run seed`                              | Run seed script(s)                                                   |
| `npm run clear -- <email>`                  | Short command to clear ride-related data for one account             |
| `npm run clear:user -- <email>`             | Clear ride-related data for one account and keep the account profile |
| `npm run clear:user -- <email> --dry-run`   | Preview what will be cleared without deleting data                   |
| `npm run clear:muhammedabiodun42@gmail.com` | Shortcut example for a specific account reset                        |
| `npm test`                                  | Placeholder test command in current package configuration            |

### Account Reset Script

Use this when you want to keep an existing account but reset its ride lifecycle data.

- Clears bookings for the account and bookings tied to rides owned/driven by the account.
- Clears rides created by the account and rides assigned to the account's driver profile.
- Clears user notifications/reviews and resets ride-specific account state.
- Keeps the account itself (email, role, password, profile) intact.

## Operational Workflows

### Startup Sequence

On server start:

1. Environment is loaded.
2. MongoDB connection initializes.
3. Redis connection initializes.
4. Default super admin bootstrap runs.
5. Background schedulers start.
6. HTTP + Socket.IO server starts listening.

### Platform Settings Broadcast

Platform setting updates are emitted through Socket.IO so connected mobile clients can
apply behavior changes (for example map provider and 3D settings) without waiting for app restarts.

## Project Structure

```text
UniRide-Backend/
  src/
    config/
    controllers/
    emails/
    middlewares/
    models/
    routes/
    scripts/
    services/
    socket/
    utils/
    app.js
    server.js
  package.json
  README.md
```

## Deployment Notes

Supported deployment targets include Render, Railway, VPS, Docker-based hosts, or any Node runtime.

Before deploying:

- Set all production environment variables.
- Configure managed MongoDB and Redis instances.
- Set secure secrets and rotate defaults.
- Verify CORS behavior for your production frontend/mobile origins.
- Smoke-test `/health`, auth, booking, and realtime flows.

## Troubleshooting

- If startup fails, validate MongoDB/Redis credentials and connectivity first.
- If auth fails unexpectedly, verify JWT secret consistency across environments.
- If realtime updates are missing, verify Socket.IO client URL and CORS rules.
- If map features fail, verify OpenRouteService key and quota.
- If emails are missing, verify Brevo credentials and sender identity configuration.

## Related Projects

- Mobile application: `../uniride`
- Admin dashboard: `../UniRide-Web`
