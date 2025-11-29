# Integrating Push Notifications into Ride Flows

This guide shows you how to integrate the push notification service into your existing ride and booking workflows.

## 📦 Import the Service

At the top of your controller files:

```javascript
const {
  sendPushNotification,
  sendBulkPushNotification,
} = require("../services/pushNotificationService");
```

## 🚗 Ride-Related Notifications

### 1. When Driver Creates a New Ride

**File**: `src/controllers/rideController.js`  
**Function**: `createRide` or similar

```javascript
// After ride is created successfully
const ride = await Ride.create({
  driver_id: req.user._id,
  pickup_location,
  dropoff_location,
  available_seats,
  fare,
});

// Notify nearby users (you can implement proximity logic)
// For now, this is a placeholder - you'd query users within a certain radius
const nearbyUsers = await User.find({
  role: "user",
  // Add your proximity query here
});

// Send to multiple users at once
await sendBulkPushNotification(
  nearbyUsers.map((u) => u._id.toString()),
  "New Ride Available",
  `A ride from ${pickup_location.address} to ${dropoff_location.address} is now available`,
  {
    ride_id: ride._id.toString(),
    type: "new_ride",
    fare: ride.fare,
  },
  "new_ride_requests" // Notification type
);
```

### 2. When User Requests a Booking

**File**: `src/controllers/bookingController.js`  
**Function**: `requestBooking`

```javascript
// After booking request is created
const booking = await Booking.create({
  user_id: req.user._id,
  ride_id,
  pickup_location,
  dropoff_location,
  seats_booked,
});

// Get the ride and driver info
const ride = await Ride.findById(ride_id).populate("driver_id");

// Notify the driver
await sendPushNotification(
  ride.driver_id._id.toString(),
  "New Ride Request",
  `${req.user.first_name} wants to book ${seats_booked} seat(s)`,
  {
    booking_id: booking._id.toString(),
    user_name: `${req.user.first_name} ${req.user.last_name}`,
    seats_booked,
    type: "new_booking_request",
  },
  "new_ride_requests" // Driver's notification type
);
```

### 3. When Driver Accepts Booking

**File**: `src/controllers/bookingController.js`  
**Function**: `confirmBooking`

```javascript
// After driver confirms booking
booking.status = "confirmed";
booking.driver_confirmed = true;
await booking.save();

// Notify the user
await sendPushNotification(
  booking.user_id.toString(),
  "Ride Accepted! 🎉",
  `Your ride has been confirmed. Driver will pick you up soon.`,
  {
    booking_id: booking._id.toString(),
    driver_name: `${req.user.first_name} ${req.user.last_name}`,
    estimated_pickup: booking.estimated_pickup_time,
    type: "ride_accepted",
  },
  "ride_accepted" // User's notification type
);
```

### 4. When Driver Starts the Ride

**File**: `src/controllers/rideController.js`  
**Function**: `startRide` or similar

```javascript
// After ride starts
ride.status = "in_progress";
ride.started_at = new Date();
await ride.save();

// Get all passengers for this ride
const bookings = await Booking.find({
  ride_id: ride._id,
  status: "confirmed",
}).populate("user_id");

// Notify all passengers
const userIds = bookings.map((b) => b.user_id._id.toString());
await sendBulkPushNotification(
  userIds,
  "Ride Started 🚗",
  "Your ride has started. Enjoy your journey!",
  {
    ride_id: ride._id.toString(),
    driver_name: `${req.user.first_name} ${req.user.last_name}`,
    type: "ride_started",
  },
  "ride_started"
);
```

### 5. When Driver is Near Pickup Location

**File**: `src/controllers/rideController.js`  
**Function**: `updateLocation`

```javascript
// When driver updates location, check proximity to pickup
const distanceToPickup = calculateDistance(
  driver.current_location,
  booking.pickup_location
);

// If within 500 meters (for example)
if (distanceToPickup <= 0.5 && !booking.proximity_notification_sent) {
  await sendPushNotification(
    booking.user_id.toString(),
    "Driver Nearby 📍",
    `Your driver is ${Math.round(distanceToPickup * 1000)}m away`,
    {
      booking_id: booking._id.toString(),
      distance: distanceToPickup,
      driver_location: driver.current_location,
      type: "driver_nearby",
    },
    "driver_nearby"
  );

  // Mark as sent to avoid duplicate notifications
  booking.proximity_notification_sent = true;
  await booking.save();
}
```

### 6. When Ride is Completed

**File**: `src/controllers/rideController.js`  
**Function**: `endRide`

```javascript
// After ride ends
ride.status = "completed";
ride.ended_at = new Date();
await ride.save();

// Update all bookings
const bookings = await Booking.find({ ride_id: ride._id }).populate("user_id");
await Booking.updateMany({ ride_id: ride._id }, { status: "completed" });

// Notify all passengers
const userIds = bookings.map((b) => b.user_id._id.toString());
await sendBulkPushNotification(
  userIds,
  "Ride Completed ✅",
  "Your ride has ended. Please rate your driver!",
  {
    ride_id: ride._id.toString(),
    type: "ride_completed",
    prompt_rating: true,
  },
  "ride_completed"
);

// Notify driver about payment
await sendPushNotification(
  ride.driver_id.toString(),
  "Ride Completed",
  `You've earned ${ride.total_fare} from this ride`,
  {
    ride_id: ride._id.toString(),
    earnings: ride.total_fare,
    type: "ride_completed",
  },
  "payment_received"
);
```

### 7. When Payment is Confirmed

**File**: `src/controllers/bookingController.js`  
**Function**: `updatePaymentStatus`

```javascript
// After payment is confirmed
booking.payment_status = "paid";
await booking.save();

const ride = await Ride.findById(booking.ride_id).populate("driver_id");

// Notify driver
await sendPushNotification(
  ride.driver_id._id.toString(),
  "Payment Received 💰",
  `${booking.user_id.first_name} has confirmed payment`,
  {
    booking_id: booking._id.toString(),
    amount: booking.fare,
    type: "payment_confirmed",
  },
  "payment_received"
);

// Notify user
await sendPushNotification(
  booking.user_id.toString(),
  "Payment Confirmed",
  "Your payment has been recorded. Thank you!",
  {
    booking_id: booking._id.toString(),
    amount: booking.fare,
    type: "payment_confirmed",
  },
  "payment_received"
);
```

### 8. When Booking is Cancelled

**File**: `src/controllers/bookingController.js`  
**Function**: `cancelBooking`

```javascript
// After cancellation
booking.status = "cancelled";
booking.cancelled_by = req.user._id;
booking.cancelled_at = new Date();
await booking.save();

const ride = await Ride.findById(booking.ride_id).populate("driver_id");

if (req.user.role === "user") {
  // User cancelled - notify driver
  await sendPushNotification(
    ride.driver_id._id.toString(),
    "Booking Cancelled",
    `${req.user.first_name} cancelled their booking`,
    {
      booking_id: booking._id.toString(),
      reason: req.body.reason,
      type: "booking_cancelled",
    },
    "new_ride_requests" // Driver gets notified of cancellations
  );
} else {
  // Driver cancelled - notify user
  await sendPushNotification(
    booking.user_id.toString(),
    "Booking Cancelled",
    "Your booking was cancelled by the driver",
    {
      booking_id: booking._id.toString(),
      reason: req.body.reason,
      type: "booking_cancelled",
    },
    "ride_accepted" // User gets notified
  );
}
```

## 👨‍💼 Admin-Related Notifications

### 9. When New Driver Application is Submitted

**File**: `src/controllers/driverController.js`  
**Function**: `applyForDriver`

```javascript
// After application is created
const application = await DriverApplication.create({
  user_id: req.user._id,
  license_number,
  vehicle_info,
  license_image_url,
});

// Get all admins and super admins
const admins = await User.find({
  role: { $in: ["admin", "super_admin"] },
});

// Notify all admins
await sendBulkPushNotification(
  admins.map((a) => a._id.toString()),
  "New Driver Application",
  `${req.user.first_name} ${req.user.last_name} has applied to become a driver`,
  {
    application_id: application._id.toString(),
    applicant_name: `${req.user.first_name} ${req.user.last_name}`,
    type: "new_driver_application",
  },
  "new_driver_applications"
);
```

### 10. When Driver is Approved

**File**: `src/controllers/adminController.js`  
**Function**: `approveDriver`

```javascript
// After approval
user.role = "driver";
user.is_approved = true;
await user.save();

application.status = "approved";
await application.save();

// Email is already sent, also send push notification
await sendPushNotification(
  user._id.toString(),
  "Application Approved! 🎉",
  "Congratulations! You are now a UniRide driver",
  {
    type: "application_approved",
    temporary_password: temporaryPassword, // Don't send this in push, just email
  },
  "new_driver_applications" // Or create a new type
);
```

### 11. When Driver is Rejected

**File**: `src/controllers/adminController.js`  
**Function**: `rejectDriver`

```javascript
// After rejection
application.status = "rejected";
application.rejection_reason = req.body.reason;
await application.save();

// Email is already sent, also send push notification
await sendPushNotification(
  application.user_id.toString(),
  "Application Update",
  "Your driver application needs attention",
  {
    type: "application_rejected",
    reason: req.body.reason,
  },
  "new_driver_applications"
);
```

### 12. When User is Flagged

**File**: `src/controllers/adminController.js`  
**Function**: `flagUser`

```javascript
// After user is flagged
user.is_flagged = !user.is_flagged;
await user.save();

if (user.is_flagged) {
  // Notify the user
  await sendPushNotification(
    user._id.toString(),
    "Account Notice",
    "Your account has been flagged. Please contact support.",
    {
      type: "account_flagged",
      reason: req.body.reason,
    },
    "system_alerts" // Create this type in NotificationSettings
  );

  // Notify all admins
  const admins = await User.find({
    role: { $in: ["admin", "super_admin"] },
  });

  await sendBulkPushNotification(
    admins.map((a) => a._id.toString()),
    "User Flagged",
    `${user.first_name} ${user.last_name} has been flagged`,
    {
      user_id: user._id.toString(),
      type: "user_flagged",
    },
    "user_flagged"
  );
}
```

## 🎯 Support & Help

### 13. When Support Ticket is Created (if you have this feature)

```javascript
// After support ticket is created
const ticket = await SupportTicket.create({
  user_id: req.user._id,
  subject,
  message,
  priority,
});

// Notify admins
const admins = await User.find({
  role: { $in: ["admin", "super_admin"] },
});

await sendBulkPushNotification(
  admins.map((a) => a._id.toString()),
  "New Support Ticket",
  `${req.user.first_name}: ${subject}`,
  {
    ticket_id: ticket._id.toString(),
    priority: ticket.priority,
    type: "new_support_ticket",
  },
  "system_alerts"
);
```

### 14. When Support Ticket is Responded To

```javascript
// After admin responds
ticket.status = "responded";
ticket.response = req.body.response;
await ticket.save();

// Notify the user
await sendPushNotification(
  ticket.user_id.toString(),
  "Support Response",
  "An admin has responded to your ticket",
  {
    ticket_id: ticket._id.toString(),
    type: "support_response",
  },
  "system_alerts"
);
```

## ⚡ Real-time + Push Notifications

You can combine Socket.io with push notifications for better coverage:

```javascript
// Example: When ride is accepted
async function notifyRideAccepted(booking, driver) {
  const userId = booking.user_id.toString();

  // Try real-time first (if user is connected via Socket.io)
  io.to(userId).emit("ride-accepted", {
    booking_id: booking._id,
    driver: {
      name: `${driver.first_name} ${driver.last_name}`,
      vehicle: driver.vehicle_info,
    },
  });

  // Also send push notification (in case user isn't actively using app)
  await sendPushNotification(
    userId,
    "Ride Accepted! 🎉",
    `${driver.first_name} accepted your booking`,
    {
      booking_id: booking._id.toString(),
      driver_name: `${driver.first_name} ${driver.last_name}`,
      type: "ride_accepted",
    },
    "ride_accepted"
  );
}
```

## 🔧 Error Handling Best Practices

Always wrap notification calls in try-catch to prevent blocking main operations:

```javascript
try {
  await sendPushNotification(
    userId,
    "Title",
    "Message",
    { data: "value" },
    "notification_type"
  );
} catch (error) {
  // Log error but don't fail the main operation
  console.error("Failed to send push notification:", error.message);
  // You could also store failed notifications for retry later
}
```

## 📊 Notification Analytics (Optional Enhancement)

Consider tracking notification delivery:

```javascript
const NotificationLog = mongoose.model("NotificationLog", {
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notification_type: String,
  title: String,
  sent_at: { type: Date, default: Date.now },
  delivery_status: { type: String, enum: ["sent", "failed", "opened"] },
  error_message: String,
});

// After sending
await NotificationLog.create({
  user_id: userId,
  notification_type: "ride_accepted",
  title: "Ride Accepted",
  delivery_status: "sent",
});
```

## 🎨 Notification Customization

You can customize notifications based on user preferences:

```javascript
const { sendPushNotification } = require("../services/pushNotificationService");

async function sendCustomNotification(
  userId,
  notificationType,
  defaultTitle,
  defaultMessage,
  data
) {
  const settings = await NotificationSettings.findOne({ user_id: userId });

  // Check if user wants this type of notification
  if (!settings?.notification_preferences?.[notificationType]) {
    console.log(
      `User ${userId} has disabled ${notificationType} notifications`
    );
    return;
  }

  // Send the notification
  await sendPushNotification(
    userId,
    defaultTitle,
    defaultMessage,
    data,
    notificationType
  );
}
```

## ✅ Integration Checklist

- [ ] Import `pushNotificationService` in ride controller
- [ ] Import `pushNotificationService` in booking controller
- [ ] Import `pushNotificationService` in admin controller
- [ ] Notify users when ride is created (optional - based on proximity)
- [ ] Notify driver when booking is requested
- [ ] Notify user when booking is accepted
- [ ] Notify passengers when ride starts
- [ ] Notify users when driver is nearby
- [ ] Notify passengers when ride is completed
- [ ] Notify driver when payment is confirmed
- [ ] Notify relevant party when booking is cancelled
- [ ] Notify admins when driver application is submitted
- [ ] Notify driver when application is approved/rejected
- [ ] Notify admins when user is flagged
- [ ] Add error handling around all notification calls
- [ ] Test each notification type on real devices

---

**Next Steps**: Test each notification flow by triggering the actual events in your app and verifying notifications appear on mobile devices.
