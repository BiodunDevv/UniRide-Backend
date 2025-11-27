# Support System - Example Workflow

## Scenario: User Cannot Verify Email

### Step 1: User Creates Ticket

**User:** John (Student)

```bash
POST /api/support/tickets/create
Authorization: Bearer user_token_john

{
  "subject": "Cannot verify my email",
  "category": "account",
  "message": "I signed up 2 hours ago but haven't received verification email",
  "priority": "medium"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "ticket001",
    "user_id": { "name": "John Doe" },
    "subject": "Cannot verify my email",
    "status": "open",
    "assigned_to": null,
    "created_at": "2025-01-21T14:00:00Z"
  }
}
```

---

### Step 2: Admin Sarah Browses Available Tickets

**Admin Sarah** logs into admin dashboard and checks available tickets:

```bash
GET /api/support/admin/tickets/available?category=account
Authorization: Bearer admin_token_sarah
```

**Response:**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "ticket001",
      "subject": "Cannot verify my email",
      "category": "account",
      "priority": "medium",
      "status": "open",
      "assigned_to": null,
      "user_id": { "name": "John Doe" },
      "created_at": "2025-01-21T14:00:00Z"
    },
    {
      "_id": "ticket002",
      "subject": "Account locked",
      "category": "account",
      "priority": "high",
      ...
    }
  ]
}
```

---

### Step 3: Admin Sarah Accepts the Ticket

Sarah sees John's email verification issue and decides to help:

```bash
PATCH /api/support/admin/tickets/ticket001/accept
Authorization: Bearer admin_token_sarah
```

**Response:**

```json
{
  "success": true,
  "message": "Ticket accepted successfully. You can now assist this user.",
  "data": {
    "_id": "ticket001",
    "status": "in_progress",
    "assigned_to": {
      "_id": "admin001",
      "name": "Sarah Johnson",
      "email": "sarah@uniride.com"
    }
  }
}
```

**Socket Events Emitted:**

- To ticket room: `ticket_accepted` (notifies John if connected)
- To all admins: `ticket_status_changed` (updates available tickets list)

---

### Step 4: Real-Time Chat Begins

**John connects to socket:**

```javascript
const socket = io("http://localhost:5000/support", {
  auth: { token: "user_token_john" },
});

socket.emit("join_ticket", "ticket001");

socket.on("ticket_joined", (data) => {
  console.log("Joined ticket:", data.ticket);
});

socket.on("ticket_accepted", (data) => {
  console.log(`${data.admin.name} is now helping you!`);
  // UI shows: "Sarah Johnson is now handling your request"
});
```

**Sarah connects to socket:**

```javascript
const socket = io("http://localhost:5000/support", {
  auth: { token: "admin_token_sarah" },
});

socket.emit("join_ticket", "ticket001");

socket.on("ticket_joined", (data) => {
  console.log("Ticket history:", data.ticket.messages);
});
```

---

### Step 5: Conversation

**Sarah sends first message:**

```javascript
socket.emit("send_message", {
  ticketId: "ticket001",
  message:
    "Hi John! I'm Sarah, and I'll help you with the email verification. Can you tell me which email address you used?",
});
```

**John receives and responds:**

```javascript
socket.on("new_message", (message) => {
  // Display: "Sarah: Hi John! I'm Sarah..."
});

socket.emit("send_message", {
  ticketId: "ticket001",
  message: "Hi Sarah! I used john.doe@university.edu",
});
```

**Typing indicators:**

```javascript
// John starts typing
socket.emit("typing", { ticketId: "ticket001" });

// Sarah sees
socket.on("user_typing", (data) => {
  // Show: "John is typing..."
});
```

---

### Step 6: Sarah Investigates and Realizes It's Technical

**Sarah checks backend logs and realizes the email service was down:**

```javascript
socket.emit("send_message", {
  ticketId: "ticket001",
  message:
    "I see the issue - our email service had a brief outage. This requires our technical team to resend the verification email. Let me transfer you to a tech admin.",
});
```

---

### Step 7: Sarah Declines the Ticket

Sarah declines the ticket so a technical admin can handle it:

```bash
PATCH /api/support/admin/tickets/ticket001/decline
Authorization: Bearer admin_token_sarah
```

**Response:**

```json
{
  "success": true,
  "message": "Ticket declined and made available for other admins",
  "data": {
    "_id": "ticket001",
    "status": "open",
    "assigned_to": null
  }
}
```

**Socket Events Emitted:**

- To ticket room: `ticket_declined`
  ```javascript
  socket.on("ticket_declined", (data) => {
    console.log(`${data.admin.name} declined the ticket`);
    // UI shows: "Sarah has transferred your request to another specialist"
  });
  ```
- To all admins: `ticket_status_changed` (ticket back in available pool)
  ```javascript
  socket.on("ticket_status_changed", (data) => {
    // Refresh available tickets list
    // ticket001 now shows as "open" again
  });
  ```

---

### Step 8: Tech Admin Mike Accepts

**Admin Mike** (Tech Lead) checks available tickets:

```bash
GET /api/support/admin/tickets/available
Authorization: Bearer admin_token_mike
```

He sees ticket001 is back in the pool and accepts it:

```bash
PATCH /api/support/admin/tickets/ticket001/accept
Authorization: Bearer admin_token_mike
```

**John receives notification:**

```javascript
socket.on("ticket_accepted", (data) => {
  console.log(`${data.admin.name} is now helping you!`);
  // UI shows: "Mike Chen (Technical Support) is now handling your request"
});
```

---

### Step 9: Mike Resolves the Issue

**Mike joins the chat:**

```javascript
socket.emit("join_ticket", "ticket001");

socket.emit("send_message", {
  ticketId: "ticket001",
  message:
    "Hi John, I'm Mike from the technical team. I see Sarah identified an email service issue. I've manually triggered a new verification email to john.doe@university.edu. Can you check your inbox in the next 2 minutes?",
});
```

**John checks and confirms:**

```javascript
socket.emit("send_message", {
  ticketId: "ticket001",
  message: "Got it! Just verified my email. Thank you so much!",
});
```

---

### Step 10: Mike Marks as Resolved

```bash
PATCH /api/support/tickets/ticket001/resolve
Authorization: Bearer admin_token_mike
```

**Response:**

```json
{
  "success": true,
  "message": "Ticket marked as resolved",
  "data": {
    "_id": "ticket001",
    "status": "resolved",
    "resolved_at": "2025-01-21T14:25:00Z"
  }
}
```

---

### Step 11: John Closes with Rating

```bash
PATCH /api/support/tickets/ticket001/close
Authorization: Bearer user_token_john

{
  "satisfaction_rating": 5,
  "satisfaction_comment": "Both Sarah and Mike were super helpful! Quick and professional service."
}
```

**Response:**

```json
{
  "success": true,
  "message": "Ticket closed successfully. Thank you for your feedback!",
  "data": {
    "_id": "ticket001",
    "status": "closed",
    "closed_at": "2025-01-21T14:26:00Z",
    "satisfaction_rating": 5,
    "satisfaction_comment": "Both Sarah and Mike were super helpful! Quick and professional service."
  }
}
```

---

## Timeline Summary

| Time  | Actor | Action                      | Status      | Assigned To |
| ----- | ----- | --------------------------- | ----------- | ----------- |
| 14:00 | John  | Creates ticket              | open        | null        |
| 14:05 | Sarah | Accepts ticket              | in_progress | Sarah       |
| 14:10 | Sarah | Chats with John             | in_progress | Sarah       |
| 14:12 | Sarah | Declines (tech issue)       | open        | null        |
| 14:13 | Mike  | Accepts ticket              | in_progress | Mike        |
| 14:15 | Mike  | Chats with John             | in_progress | Mike        |
| 14:20 | Mike  | Triggers verification email | in_progress | Mike        |
| 14:22 | John  | Confirms email received     | in_progress | Mike        |
| 14:24 | Mike  | Marks resolved              | resolved    | Mike        |
| 14:26 | John  | Closes with 5-star rating   | closed      | Mike        |

**Total Time:** 26 minutes from creation to closure  
**Admins Involved:** 2 (Sarah → Mike)  
**Messages Exchanged:** ~8  
**Satisfaction:** ⭐⭐⭐⭐⭐ (5/5)

---

## Key Takeaways

1. **Dynamic Assignment Works**: Sarah could immediately grab the ticket without waiting for manual assignment
2. **Seamless Handoff**: When Sarah couldn't help, she declined and Mike picked it up instantly
3. **No Wasted Time**: Ticket didn't get stuck with wrong admin
4. **Real-Time Updates**: John was notified immediately when admins changed
5. **Team Collaboration**: Two admins worked together to resolve the issue
6. **User Satisfaction**: Fast resolution led to 5-star rating

---

## What Happens if Admin B Tries to Accept While Admin A is Working?

**Scenario:** Admin Sarah has accepted ticket001. Admin Mike tries to accept the same ticket.

**Mike's request:**

```bash
PATCH /api/support/admin/tickets/ticket001/accept
Authorization: Bearer admin_token_mike
```

**Response (Conflict Prevention):**

```json
{
  "success": false,
  "message": "Ticket is already being handled by another admin",
  "assigned_to": {
    "name": "Sarah Johnson",
    "email": "sarah@uniride.com"
  }
}
```

**Result:** Mike knows Sarah is handling it and can move on to another ticket. No duplicate efforts!

---

## Socket Events Flow Diagram

```
USER                     ADMIN SARAH              ADMIN MIKE              SERVER
 |                            |                        |                     |
 |-- create ticket -------------------------------------------------> [OPEN, null]
 |                            |                        |                     |
 |                            |-- accept ticket -----------------> [IN_PROGRESS, Sarah]
 |<--- ticket_accepted -------|                        |                     |
 |                            |                        |                     |
 |<--- chat messages -------->|                        |                     |
 |                            |                        |                     |
 |                            |-- decline ticket --------> [OPEN, null]      |
 |<--- ticket_declined -------|                        |                     |
 |                            |<--- ticket_status_changed (available again)  |
 |                            |                        |                     |
 |                            |                        |-- accept ticket --> [IN_PROGRESS, Mike]
 |<--- ticket_accepted --------------------------------|                     |
 |                            |                        |                     |
 |<--- chat messages ------------------------------------->                  |
 |                            |                        |                     |
 |                            |                        |-- resolve --------> [RESOLVED]
 |                            |                        |                     |
 |-- close with rating -------------------------------------------------> [CLOSED]
```

---

This workflow demonstrates the power and flexibility of the dynamic ticket assignment system!
