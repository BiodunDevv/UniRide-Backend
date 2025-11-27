# UniRide Support System Documentation

## Overview

The UniRide Support System provides real-time customer support functionality using Socket.IO for live chat between users/drivers and support staff (admins). The system includes ticket management, priority handling, and satisfaction ratings.

## Features

- **Real-time Chat**: Live messaging between users and support staff using Socket.IO
- **Ticket Management**: Create, track, and manage support tickets
- **Priority Levels**: Low, Medium, High, Urgent
- **Categories**: Account, Payment, Ride, Technical, Other
- **Assignment System**: Admins can assign tickets to specific support staff
- **Session Tracking**: Active chat sessions are tracked and cleared when closed
- **Satisfaction Ratings**: Users can rate support experience (1-5 stars)
- **Role-based Access**: Different permissions for users, drivers, and admins

## Database Model

### SupportTicket Schema

```javascript
{
  user_id: ObjectId,          // User who created the ticket
  subject: String,            // Ticket subject (max 200 chars)
  category: String,           // account, payment, ride, technical, other
  priority: String,           // low, medium, high, urgent
  status: String,             // open, in_progress, resolved, closed
  assigned_to: ObjectId,      // Admin assigned to handle this
  messages: [{
    sender_id: ObjectId,
    sender_role: String,
    message: String,
    timestamp: Date
  }],
  resolved_at: Date,
  closed_at: Date,
  satisfaction_rating: Number, // 1-5
  satisfaction_comment: String,
  timestamps: true             // createdAt, updatedAt
}
```

## API Endpoints

### User Endpoints

#### Create Support Ticket

```http
POST /api/support/tickets/create
Authorization: Bearer <token>

Body:
{
  "subject": "Unable to complete payment",
  "category": "payment",
  "message": "I'm getting an error when trying to pay",
  "priority": "high"  // optional
}
```

#### Get My Tickets

```http
GET /api/support/tickets/my-tickets
GET /api/support/tickets/my-tickets?status=open
Authorization: Bearer <token>
```

#### Get Specific Ticket

```http
GET /api/support/tickets/:id
Authorization: Bearer <token>
```

#### Add Message to Ticket

```http
POST /api/support/tickets/:id/message
Authorization: Bearer <token>

Body:
{
  "message": "Here's a screenshot of the error"
}
```

#### Close Ticket with Rating

```http
PATCH /api/support/tickets/:id/close
Authorization: Bearer <token>

Body:
{
  "satisfaction_rating": 5,
  "satisfaction_comment": "Very helpful, resolved quickly!"
}
```

### Admin Endpoints

#### Get All Tickets

```http
GET /api/support/admin/tickets
GET /api/support/admin/tickets?status=open&priority=urgent
Authorization: Bearer <admin_token>
```

#### Assign Ticket to Support Staff

```http
PATCH /api/support/admin/tickets/:id/assign
Authorization: Bearer <admin_token>

Body:
{
  "admin_id": "64abc123..."
}
```

#### Update Ticket Priority

```http
PATCH /api/support/admin/tickets/:id/priority
Authorization: Bearer <admin_token>

Body:
{
  "priority": "urgent"
}
```

#### Resolve Ticket

```http
PATCH /api/support/tickets/:id/resolve
Authorization: Bearer <admin_token>
```

## Socket.IO Integration

### Connection

Connect to the support namespace:

```javascript
const socket = io("http://localhost:5000/support", {
  auth: {
    token: "your-jwt-token",
  },
});
```

### Events

#### Client to Server

**join_ticket** - Join a ticket room

```javascript
socket.emit("join_ticket", ticketId);
```

**send_message** - Send a message

```javascript
socket.emit("send_message", {
  ticketId: "64abc123...",
  message: "Hello, I need help with...",
});
```

**typing** - Indicate user is typing

```javascript
socket.emit("typing", { ticketId: "64abc123..." });
```

**stop_typing** - Stop typing indicator

```javascript
socket.emit("stop_typing", { ticketId: "64abc123..." });
```

**leave_ticket** - Leave ticket room

```javascript
socket.emit("leave_ticket", ticketId);
```

#### Server to Client

**ticket_joined** - Confirmation of joining ticket

```javascript
socket.on("ticket_joined", (data) => {
  console.log("Joined ticket:", data.ticket);
});
```

**new_message** - New message received

```javascript
socket.on("new_message", (message) => {
  console.log("New message:", message);
  // message structure:
  // {
  //   sender_id: { _id, name, role },
  //   sender_role: 'user',
  //   message: 'Hello',
  //   timestamp: Date
  // }
});
```

**user_joined** - Someone joined the ticket

```javascript
socket.on("user_joined", (data) => {
  console.log(`${data.user.name} joined the chat`);
});
```

**user_left** - Someone left the ticket

```javascript
socket.on("user_left", (data) => {
  console.log(`${data.user.name} left the chat`);
});
```

**user_typing** - Someone is typing

```javascript
socket.on("user_typing", (data) => {
  console.log(`${data.user.name} is typing...`);
});
```

**user_stop_typing** - Stopped typing

```javascript
socket.on("user_stop_typing", (data) => {
  console.log(`${data.user.name} stopped typing`);
});
```

**error** - Error occurred

```javascript
socket.on("error", (error) => {
  console.error("Error:", error.message);
});
```

## Usage Flow

### For Users/Drivers

1. **Create Ticket**: User creates a support ticket via REST API
2. **Connect Socket**: User connects to `/support` namespace with JWT token
3. **Join Ticket**: Emit `join_ticket` with ticket ID
4. **Chat**: Send and receive messages in real-time
5. **Close Ticket**: When satisfied, close ticket with rating

### For Admins

1. **View Tickets**: Get all open tickets via REST API
2. **Assign Ticket**: Assign ticket to themselves or another admin
3. **Connect Socket**: Connect to `/support` namespace
4. **Join Ticket**: Emit `join_ticket` with ticket ID
5. **Provide Support**: Chat with user to resolve issue
6. **Resolve Ticket**: Mark ticket as resolved when done

## Session Management

### Active Sessions

The system tracks active socket sessions:

```javascript
{
  userId: ObjectId,
  ticketId: String,
  role: String,
  joinedAt: Date
}
```

### Session Cleanup

Sessions are automatically cleared when:

- User disconnects from socket
- User emits `leave_ticket` event
- Socket connection is lost

## Security Features

1. **JWT Authentication**: All socket connections require valid JWT token
2. **Permission Checks**: Users can only access their own tickets
3. **Admin Verification**: Only admins can assign, resolve, and view all tickets
4. **Flagged Account Check**: Flagged users cannot connect to support

## Example Client Implementation

### React/JavaScript Example

```javascript
import io from "socket.io-client";

class SupportChat {
  constructor(token, ticketId) {
    this.socket = io("http://localhost:5000/support", {
      auth: { token },
    });

    this.ticketId = ticketId;
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on("connect", () => {
      console.log("Connected to support");
      this.socket.emit("join_ticket", this.ticketId);
    });

    this.socket.on("ticket_joined", (data) => {
      console.log("Joined ticket:", data.ticket);
    });

    this.socket.on("new_message", (message) => {
      this.displayMessage(message);
    });

    this.socket.on("user_typing", (data) => {
      this.showTypingIndicator(data.user.name);
    });

    this.socket.on("user_stop_typing", () => {
      this.hideTypingIndicator();
    });

    this.socket.on("error", (error) => {
      console.error("Error:", error.message);
    });
  }

  sendMessage(message) {
    this.socket.emit("send_message", {
      ticketId: this.ticketId,
      message: message,
    });
  }

  startTyping() {
    this.socket.emit("typing", { ticketId: this.ticketId });
  }

  stopTyping() {
    this.socket.emit("stop_typing", { ticketId: this.ticketId });
  }

  disconnect() {
    this.socket.emit("leave_ticket", this.ticketId);
    this.socket.disconnect();
  }

  displayMessage(message) {
    // Update UI with new message
  }

  showTypingIndicator(userName) {
    // Show "userName is typing..."
  }

  hideTypingIndicator() {
    // Hide typing indicator
  }
}

// Usage
const token = "your-jwt-token";
const ticketId = "64abc123...";
const chat = new SupportChat(token, ticketId);

// Send message
chat.sendMessage("Hello, I need help!");

// Handle typing
inputField.addEventListener("keydown", () => chat.startTyping());
inputField.addEventListener("blur", () => chat.stopTyping());

// Cleanup on component unmount
chat.disconnect();
```

## Status Flow

```
open → in_progress → resolved → closed
  ↓         ↓           ↓
(user)   (admin)    (admin)   → (user closes & rates)
```

## Best Practices

1. **Always authenticate** socket connections with valid JWT
2. **Clean up sessions** when user leaves or completes support
3. **Set appropriate priority** based on issue severity
4. **Assign tickets quickly** to reduce wait times
5. **Request ratings** after resolution for quality tracking
6. **Monitor active sessions** to manage support load

## Troubleshooting

### Common Issues

**Socket won't connect**

- Check JWT token is valid
- Verify Socket.IO client version compatibility
- Ensure CORS is configured correctly

**Messages not sending**

- Verify user has joined the ticket room
- Check user has permission for that ticket
- Ensure ticket exists and is not closed

**Can't join ticket**

- Verify ticket ID is correct
- Check user has permission (owner/admin/assigned)
- Ensure user account is not flagged

## Testing

```bash
# Test ticket creation
curl -X POST http://localhost:5000/api/support/tickets/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test ticket",
    "category": "technical",
    "message": "Testing support system"
  }'

# Test getting tickets
curl http://localhost:5000/api/support/tickets/my-tickets \
  -H "Authorization: Bearer <token>"
```

## Performance Considerations

- Messages are stored in MongoDB (not in-memory)
- Active sessions map is in-memory for fast lookup
- Socket rooms provide efficient broadcasting
- Indexes on ticket queries for performance
- Session cleanup prevents memory leaks
