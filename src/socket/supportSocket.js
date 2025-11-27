const SupportTicket = require("../models/SupportTicket");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Store active support sessions
const activeSessions = new Map();

/**
 * Initialize support socket handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
const initializeSupportSocket = (io) => {
  const supportNamespace = io.of("/support");

  // Middleware to authenticate socket connections
  supportNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("User not found"));
      }

      if (user.is_flagged) {
        return next(new Error("Account is flagged"));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Invalid authentication token"));
    }
  });

  supportNamespace.on("connection", (socket) => {
    console.log(
      `Support connection: ${socket.user.name} (${socket.user.role})`
    );

    // Join ticket room
    socket.on("join_ticket", async (ticketId) => {
      try {
        const ticket = await SupportTicket.findById(ticketId)
          .populate("user_id", "name email role")
          .populate("assigned_to", "name email")
          .populate("messages.sender_id", "name role");

        if (!ticket) {
          socket.emit("error", { message: "Ticket not found" });
          return;
        }

        // Check permissions
        const isOwner =
          ticket.user_id._id.toString() === socket.user._id.toString();
        const isAdmin = ["admin", "super_admin"].includes(socket.user.role);
        const isAssigned =
          ticket.assigned_to &&
          ticket.assigned_to._id.toString() === socket.user._id.toString();

        if (!isOwner && !isAdmin && !isAssigned) {
          socket.emit("error", {
            message: "You don't have permission to access this ticket",
          });
          return;
        }

        // Join the ticket room
        socket.join(`ticket_${ticketId}`);

        // Track active session
        activeSessions.set(socket.id, {
          userId: socket.user._id,
          ticketId,
          role: socket.user.role,
          joinedAt: new Date(),
        });

        // Emit ticket data
        socket.emit("ticket_joined", {
          success: true,
          ticket,
        });

        // Notify others in the room
        socket.to(`ticket_${ticketId}`).emit("user_joined", {
          user: {
            id: socket.user._id,
            name: socket.user.name,
            role: socket.user.role,
          },
        });

        console.log(`${socket.user.name} joined ticket ${ticketId}`);
      } catch (error) {
        console.error("Error joining ticket:", error);
        socket.emit("error", { message: "Failed to join ticket" });
      }
    });

    // Send message in ticket
    socket.on("send_message", async ({ ticketId, message }) => {
      try {
        if (!message || !message.trim()) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        const ticket = await SupportTicket.findById(ticketId);

        if (!ticket) {
          socket.emit("error", { message: "Ticket not found" });
          return;
        }

        // Check permissions
        const isOwner =
          ticket.user_id.toString() === socket.user._id.toString();
        const isAdmin = ["admin", "super_admin"].includes(socket.user.role);
        const isAssigned =
          ticket.assigned_to &&
          ticket.assigned_to.toString() === socket.user._id.toString();

        if (!isOwner && !isAdmin && !isAssigned) {
          socket.emit("error", {
            message:
              "You don't have permission to send messages to this ticket",
          });
          return;
        }

        // Add message to ticket
        const newMessage = {
          sender_id: socket.user._id,
          sender_role: socket.user.role,
          message: message.trim(),
          timestamp: new Date(),
        };

        ticket.messages.push(newMessage);
        await ticket.save();

        // Populate sender info for the new message
        const populatedMessage = {
          ...newMessage.toObject(),
          sender_id: {
            _id: socket.user._id,
            name: socket.user.name,
            role: socket.user.role,
          },
        };

        // Broadcast message to all users in the ticket room
        supportNamespace
          .to(`ticket_${ticketId}`)
          .emit("new_message", populatedMessage);

        console.log(
          `Message sent in ticket ${ticketId} by ${socket.user.name}`
        );
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing", ({ ticketId }) => {
      socket.to(`ticket_${ticketId}`).emit("user_typing", {
        user: {
          id: socket.user._id,
          name: socket.user.name,
          role: socket.user.role,
        },
      });
    });

    // Stop typing indicator
    socket.on("stop_typing", ({ ticketId }) => {
      socket.to(`ticket_${ticketId}`).emit("user_stop_typing", {
        user: {
          id: socket.user._id,
          name: socket.user.name,
          role: socket.user.role,
        },
      });
    });

    // Leave ticket room
    socket.on("leave_ticket", (ticketId) => {
      socket.leave(`ticket_${ticketId}`);

      socket.to(`ticket_${ticketId}`).emit("user_left", {
        user: {
          id: socket.user._id,
          name: socket.user.name,
          role: socket.user.role,
        },
      });

      // Remove from active sessions
      activeSessions.delete(socket.id);

      console.log(`${socket.user.name} left ticket ${ticketId}`);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const session = activeSessions.get(socket.id);

      if (session) {
        supportNamespace.to(`ticket_${session.ticketId}`).emit("user_left", {
          user: {
            id: socket.user._id,
            name: socket.user.name,
            role: socket.user.role,
          },
        });

        activeSessions.delete(socket.id);
      }

      console.log(
        `Support disconnection: ${socket.user.name} (${socket.user.role})`
      );
    });
  });

  return supportNamespace;
};

/**
 * Get active support sessions
 * @returns {Array} Array of active sessions
 */
const getActiveSessions = () => {
  return Array.from(activeSessions.values());
};

/**
 * Clear session for a specific socket
 * @param {String} socketId - Socket ID to clear
 */
const clearSession = (socketId) => {
  activeSessions.delete(socketId);
};

module.exports = {
  initializeSupportSocket,
  getActiveSessions,
  clearSession,
};
