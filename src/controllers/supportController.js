const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const AdminNotification = require("../models/AdminNotification");
const { createAndPush } = require("../services/notificationService");
const { getIO } = require("../utils/socketManager");

/**
 * @swagger
 * /api/support/tickets/public:
 *   post:
 *     summary: Create a support ticket (public — no authentication required)
 *     tags: [Support]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - subject
 *               - category
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               subject:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [account, payment, ride, technical, other]
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Missing required fields
 */
const createPublicTicket = async (req, res, next) => {
  try {
    const { name, email, subject, category, message, priority } = req.body;

    if (!name || !email || !subject || !category || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, subject, category, and message are required",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Check if user exists with this email
    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    const ticketData = {
      subject: subject.trim(),
      category,
      priority: priority || "medium",
      messages: [
        {
          sender_name: name.trim(),
          sender_role: existingUser ? existingUser.role : "guest",
          message: message.trim(),
        },
      ],
    };

    if (existingUser) {
      ticketData.user_id = existingUser._id;
      ticketData.messages[0].sender_id = existingUser._id;
    } else {
      ticketData.guest_name = name.trim();
      ticketData.guest_email = email.trim().toLowerCase();
    }

    const ticket = await SupportTicket.create(ticketData);

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate("user_id", "name email role")
      .populate("messages.sender_id", "name role");

    // Create notification for admins
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "New Support Ticket",
        message: `${name} submitted a ${
          priority || "medium"
        } priority support ticket: ${subject}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: priority || "medium",
        metadata: {
          ticket_number: ticket.ticket_number,
          ticket_subject: subject,
          ticket_category: category,
          ticket_priority: priority || "medium",
          user_name: name,
          user_email: email,
          is_guest: !existingUser,
          action: "ticket_created",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: {
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/track:
 *   post:
 *     summary: Track support ticket(s) by email (public — no authentication required)
 *     tags: [Support]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               ticket_number:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tickets found
 *       404:
 *         description: No tickets found
 */
const trackTicket = async (req, res, next) => {
  try {
    const { email, ticket_number } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });

    // Build filter — search by user_id OR guest_email
    const filter = {
      $or: [
        ...(user ? [{ user_id: user._id }] : []),
        { guest_email: normalizedEmail },
      ],
    };

    // If ticket_number is provided, narrow down
    if (ticket_number) {
      filter.ticket_number = ticket_number.trim().toUpperCase();
    }

    const tickets = await SupportTicket.find(filter)
      .populate("assigned_to", "name")
      .populate("messages.sender_id", "name role")
      .sort({ createdAt: -1 })
      .select(
        "ticket_number subject category priority status messages assigned_to createdAt resolved_at closed_at satisfaction_rating",
      );

    if (!tickets.length) {
      return res.status(404).json({
        success: false,
        message: ticket_number
          ? "No ticket found with that number and email combination"
          : "No support tickets found for this email address",
        code: "NOT_FOUND",
      });
    }

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/create:
 *   post:
 *     summary: Create a new support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - category
 *               - message
 *             properties:
 *               subject:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [account, payment, ride, technical, other]
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       201:
 *         description: Ticket created successfully
 */
const createTicket = async (req, res, next) => {
  try {
    const { subject, category, message, priority } = req.body;

    if (!subject || !category || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject, category, and message are required",
      });
    }

    const ticket = await SupportTicket.create({
      user_id: req.user._id,
      subject,
      category,
      priority: priority || "medium",
      messages: [
        {
          sender_id: req.user._id,
          sender_role: req.user.role,
          message,
        },
      ],
    });

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate("user_id", "name email role")
      .populate("messages.sender_id", "name role");

    // Create notification for admins about new support ticket
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "New Support Ticket",
        message: `${req.user.name} created a new ${
          priority || "medium"
        } priority support ticket: ${subject}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: priority || "medium",
        metadata: {
          ticket_subject: subject,
          ticket_category: category,
          ticket_priority: priority || "medium",
          user_name: req.user.name,
          user_email: req.user.email,
          user_role: req.user.role,
          action: "ticket_created",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: populatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/my-tickets:
 *   get:
 *     summary: Get all tickets created by the logged-in user
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 */
const getMyTickets = async (req, res, next) => {
  try {
    const { status } = req.query;

    const filter = { user_id: req.user._id };
    if (status) {
      filter.status = status;
    }

    const tickets = await SupportTicket.find(filter)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/{id}:
 *   get:
 *     summary: Get a specific ticket by ID
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket retrieved successfully
 */
const getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if user has permission to view this ticket
    const isOwner =
      ticket.user_id &&
      ticket.user_id._id.toString() === req.user._id.toString();
    const isAdmin = ["admin", "super_admin"].includes(req.user.role);
    const isAssigned =
      ticket.assigned_to &&
      ticket.assigned_to._id.toString() === req.user._id.toString();

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to view this ticket",
      });
    }

    res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/{id}/message:
 *   post:
 *     summary: Add a message to a ticket (used for non-socket communication)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message added successfully
 */
const addMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check permissions
    const isOwner =
      ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isAdmin = ["admin", "super_admin"].includes(req.user.role);
    const isAssigned =
      ticket.assigned_to &&
      ticket.assigned_to.toString() === req.user._id.toString();

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to add messages to this ticket",
      });
    }

    // Don't allow messages on closed tickets
    if (ticket.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Cannot add messages to a closed ticket",
      });
    }

    // Auto-assign: if an admin replies to an unassigned ticket, auto-assign to them
    if (isAdmin && !ticket.assigned_to) {
      ticket.assigned_to = req.user._id;
      ticket.status = "in_progress";
    }

    // If ticket was open and user (owner) sends a message, keep it open but allow
    // If ticket was resolved and user sends a message, reopen as in_progress
    if (isOwner && ticket.status === "resolved") {
      ticket.status = "in_progress";
    }

    // Add message
    ticket.messages.push({
      sender_id: req.user._id,
      sender_name: req.user.name,
      sender_role: req.user.role,
      message,
    });

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    // If admin/agent replied, send push notification to the ticket owner
    if (isAdmin && ticket.user_id) {
      try {
        await createAndPush(
          ticket.user_id,
          "New Support Reply 💬",
          `${req.user.name} replied to your support ticket: "${ticket.subject}".`,
          "system",
          { action: "support_reply", ticket_id: ticket._id.toString() },
        );
      } catch (e) {
        console.error("Support reply notification failed:", e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Message added successfully",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/{id}/resolve:
 *   patch:
 *     summary: Mark a ticket as resolved
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket marked as resolved
 */
const resolveTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Only admins or assigned staff can resolve tickets
    const isAdmin = ["admin", "super_admin"].includes(req.user.role);
    const isAssigned =
      ticket.assigned_to &&
      ticket.assigned_to.toString() === req.user._id.toString();

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "Only admins or assigned support staff can resolve tickets",
      });
    }

    ticket.status = "resolved";
    ticket.resolved_at = new Date();
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    // Create notification for admins about ticket resolution
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "Support Ticket Resolved",
        message: `${req.user.name} resolved support ticket: ${updatedTicket.subject}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: "low",
        metadata: {
          ticket_subject: updatedTicket.subject,
          ticket_category: updatedTicket.category,
          resolved_by: req.user.name,
          resolved_by_id: req.user._id,
          user_name:
            updatedTicket.user_id?.name || updatedTicket.guest_name || "Guest",
          action: "ticket_resolved",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    // Notify ticket owner that their ticket was resolved
    if (ticket.user_id) {
      try {
        await createAndPush(
          ticket.user_id,
          "Ticket Resolved ✅",
          `Your support ticket "${ticket.subject}" has been resolved. If you need further help, you can reopen it by replying.`,
          "system",
          { action: "ticket_resolved", ticket_id: ticket._id.toString() },
        );
      } catch (e) {
        console.error("Ticket resolved user notification failed:", e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Ticket marked as resolved",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/tickets/{id}/close:
 *   patch:
 *     summary: Close a ticket and optionally provide satisfaction rating
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               satisfaction_rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               satisfaction_comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket closed successfully
 */
const closeTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { satisfaction_rating, satisfaction_comment } = req.body;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Allow ticket owner, assigned admin, or any admin/super_admin to close
    const isTicketOwner =
      ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isAdminUser = ["admin", "super_admin"].includes(req.user.role);
    const isAssignedAgent =
      ticket.assigned_to &&
      ticket.assigned_to.toString() === req.user._id.toString();

    if (!isTicketOwner && !isAdminUser && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to close this ticket",
      });
    }

    ticket.status = "closed";
    ticket.closed_at = new Date();

    if (satisfaction_rating) {
      if (satisfaction_rating < 1 || satisfaction_rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Satisfaction rating must be between 1 and 5",
        });
      }
      ticket.satisfaction_rating = satisfaction_rating;
    }

    if (satisfaction_comment) {
      ticket.satisfaction_comment = satisfaction_comment;
    }

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    // Create notification for admins about ticket closure
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "Support Ticket Closed",
        message: `${req.user.name} closed support ticket: ${
          updatedTicket.subject
        }${satisfaction_rating ? ` (Rating: ${satisfaction_rating}/5)` : ""}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: "low",
        metadata: {
          ticket_subject: updatedTicket.subject,
          ticket_category: updatedTicket.category,
          closed_by: req.user.name,
          closed_by_id: req.user._id,
          satisfaction_rating: satisfaction_rating || null,
          satisfaction_comment: satisfaction_comment || null,
          action: "ticket_closed",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    // Notify ticket owner that their ticket was closed (only if admin closed it)
    if (!isTicketOwner && ticket.user_id) {
      try {
        await createAndPush(
          ticket.user_id,
          "Ticket Closed",
          `Your support ticket "${updatedTicket.subject}" has been closed. Thank you for contacting UniRide support.`,
          "system",
          { action: "ticket_closed", ticket_id: ticket._id.toString() },
        );
      } catch (e) {
        console.error("Ticket closed user notification failed:", e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Ticket closed successfully. Thank you for your feedback!",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets/mine:
 *   get:
 *     summary: Get tickets assigned to the current admin
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_progress, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *     responses:
 *       200:
 *         description: Assigned tickets retrieved successfully
 */
const getMyAssignedTickets = async (req, res, next) => {
  try {
    const { status, priority } = req.query;

    const filter = { assigned_to: req.user._id };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const tickets = await SupportTicket.find(filter)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets:
 *   get:
 *     summary: Get all support tickets (Admin only)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [account, payment, ride, technical, other]
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 */
const getAllTickets = async (req, res, next) => {
  try {
    const { status, priority, category } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const tickets = await SupportTicket.find(filter)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role")
      .sort({ priority: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets/available:
 *   get:
 *     summary: Get available tickets (open, not assigned) for admins to accept
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [account, payment, ride, technical, other]
 *     responses:
 *       200:
 *         description: Available tickets retrieved successfully
 */
const getAvailableTickets = async (req, res, next) => {
  try {
    const { priority, category } = req.query;

    const filter = {
      status: "open",
      assigned_to: null,
    };

    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const tickets = await SupportTicket.find(filter)
      .populate("user_id", "name email role")
      .populate("messages.sender_id", "name role")
      .sort({ priority: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets/{id}/accept:
 *   patch:
 *     summary: Accept a ticket (admin self-assigns)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket accepted successfully
 */
const acceptTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check if ticket is already assigned
    if (ticket.assigned_to) {
      // Super admins can reassign tickets from other admins
      if (req.user.role !== "super_admin") {
        const assignedAdmin = await User.findById(ticket.assigned_to).select(
          "name email",
        );
        return res.status(400).json({
          success: false,
          message: "Ticket is already being handled by another admin",
          assigned_to: assignedAdmin,
        });
      }
    }

    // Check if ticket is already closed
    if (ticket.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Cannot accept a closed ticket",
      });
    }

    // Admin accepts the ticket (self-assign)
    ticket.assigned_to = req.user._id;
    ticket.status = "in_progress";
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    // Emit socket event to notify about ticket acceptance
    try {
      const io = getIO();
      const supportNamespace = io.of("/support");

      // Notify the ticket room
      supportNamespace.to(`ticket_${id}`).emit("ticket_accepted", {
        ticketId: id,
        admin: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
        },
        status: "in_progress",
      });

      // Notify all admins about ticket assignment (updates available list)
      supportNamespace.emit("ticket_status_changed", {
        ticketId: id,
        status: "in_progress",
        assigned_to: req.user._id,
      });
    } catch (socketError) {
      console.error("Error emitting socket event:", socketError);
      // Continue even if socket notification fails
    }

    // Create notification for other admins about ticket acceptance
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "Support Ticket Accepted",
        message: `${req.user.name} accepted support ticket: ${updatedTicket.subject}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: ticket.priority,
        metadata: {
          ticket_subject: updatedTicket.subject,
          ticket_category: updatedTicket.category,
          assigned_to: req.user.name,
          assigned_to_id: req.user._id,
          user_name:
            updatedTicket.user_id?.name || updatedTicket.guest_name || "Guest",
          action: "ticket_accepted",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Ticket accepted successfully. You can now assist this user.",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets/{id}/decline:
 *   patch:
 *     summary: Decline a ticket (unassign and make available for others)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket declined successfully
 */
const declineTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Allow assigned admin or super_admin to unassign
    if (!ticket.assigned_to) {
      return res.status(400).json({
        success: false,
        message: "This ticket is not assigned to anyone",
      });
    }

    const isAssignedToMe =
      ticket.assigned_to.toString() === req.user._id.toString();
    const isSuperAdmin = req.user.role === "super_admin";

    if (!isAssignedToMe && !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "You can only decline tickets assigned to you",
      });
    }

    // Unassign and reopen the ticket
    ticket.assigned_to = null;
    ticket.status = "open";
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("messages.sender_id", "name role");

    // Emit socket event to notify about ticket decline
    try {
      const io = getIO();
      const supportNamespace = io.of("/support");

      // Notify the ticket room
      supportNamespace.to(`ticket_${id}`).emit("ticket_declined", {
        ticketId: id,
        admin: {
          id: req.user._id,
          name: req.user.name,
        },
        status: "open",
      });

      // Notify all admins that ticket is available again
      supportNamespace.emit("ticket_status_changed", {
        ticketId: id,
        status: "open",
        assigned_to: null,
      });
    } catch (socketError) {
      console.error("Error emitting socket event:", socketError);
      // Continue even if socket notification fails
    }

    // Create notification for other admins about ticket decline
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "Support Ticket Declined",
        message: `${req.user.name} declined support ticket: ${updatedTicket.subject} - Now available for assignment`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: ticket.priority,
        metadata: {
          ticket_subject: updatedTicket.subject,
          ticket_category: updatedTicket.category,
          declined_by: req.user.name,
          declined_by_id: req.user._id,
          user_name:
            updatedTicket.user_id?.name || updatedTicket.guest_name || "Guest",
          action: "ticket_declined",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Ticket declined and made available for other admins",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/support/admin/tickets/{id}/priority:
 *   patch:
 *     summary: Update ticket priority (Admin only)
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - priority
 *             properties:
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       200:
 *         description: Priority updated successfully
 */
const updatePriority = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority || !["low", "medium", "high", "urgent"].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Valid priority is required (low, medium, high, urgent)",
      });
    }

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const previousPriority = ticket.priority;
    ticket.priority = priority;
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    // Create notification for admins about priority change
    try {
      await AdminNotification.create({
        type: "support_ticket",
        title: "Ticket Priority Updated",
        message: `${req.user.name} changed ticket priority from ${previousPriority} to ${priority}: ${updatedTicket.subject}`,
        reference_id: ticket._id,
        reference_model: "SupportTicket",
        priority: priority,
        metadata: {
          ticket_subject: updatedTicket.subject,
          ticket_category: updatedTicket.category,
          previous_priority: previousPriority,
          new_priority: priority,
          updated_by: req.user.name,
          updated_by_id: req.user._id,
          user_name:
            updatedTicket.user_id?.name || updatedTicket.guest_name || "Guest",
          action: "ticket_priority_updated",
        },
      });
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: "Priority updated successfully",
      data: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPublicTicket,
  trackTicket,
  createTicket,
  getMyTickets,
  getMyAssignedTickets,
  getTicketById,
  addMessage,
  resolveTicket,
  closeTicket,
  getAllTickets,
  getAvailableTickets,
  acceptTicket,
  declineTicket,
  updatePriority,
};
