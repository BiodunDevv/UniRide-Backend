const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");

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
    const isOwner = ticket.user_id._id.toString() === req.user._id.toString();
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
    const isOwner = ticket.user_id.toString() === req.user._id.toString();
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

    // Add message
    ticket.messages.push({
      sender_id: req.user._id,
      sender_role: req.user.role,
      message,
    });

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

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

    // Only ticket owner can close their own ticket
    if (ticket.user_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the ticket owner can close their ticket",
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
 * /api/support/admin/tickets/{id}/assign:
 *   patch:
 *     summary: Assign a ticket to a support staff (Admin only)
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
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket assigned successfully
 */
const assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_id } = req.body;

    if (!admin_id) {
      return res.status(400).json({
        success: false,
        message: "Admin ID is required",
      });
    }

    const admin = await User.findById(admin_id);
    if (!admin || !["admin", "super_admin"].includes(admin.role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    ticket.assigned_to = admin_id;
    ticket.status = "in_progress";
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

    res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
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

    ticket.priority = priority;
    await ticket.save();

    const updatedTicket = await SupportTicket.findById(id)
      .populate("user_id", "name email role")
      .populate("assigned_to", "name email")
      .populate("messages.sender_id", "name role");

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
  createTicket,
  getMyTickets,
  getTicketById,
  addMessage,
  resolveTicket,
  closeTicket,
  getAllTickets,
  assignTicket,
  updatePriority,
};
