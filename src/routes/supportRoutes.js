const express = require("express");
const router = express.Router();
const {
  createTicket,
  getMyTickets,
  getTicketById,
  addMessage,
  resolveTicket,
  closeTicket,
  getAllTickets,
  getAvailableTickets,
  acceptTicket,
  declineTicket,
  updatePriority,
} = require("../controllers/supportController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");

// User routes - accessible to all authenticated users
router.post("/tickets/create", protect, createTicket);
router.get("/tickets/my-tickets", protect, getMyTickets);
router.get("/tickets/:id", protect, getTicketById);
router.post("/tickets/:id/message", protect, addMessage);
router.patch("/tickets/:id/close", protect, closeTicket);

// Support staff routes - accessible to admins and assigned support staff
router.patch(
  "/tickets/:id/resolve",
  protect,
  authorize("admin", "super_admin"),
  resolveTicket
);

// Admin-only routes
router.get(
  "/admin/tickets",
  protect,
  authorize("admin", "super_admin"),
  getAllTickets
);
router.get(
  "/admin/tickets/available",
  protect,
  authorize("admin", "super_admin"),
  getAvailableTickets
);
router.patch(
  "/admin/tickets/:id/accept",
  protect,
  authorize("admin", "super_admin"),
  acceptTicket
);
router.patch(
  "/admin/tickets/:id/decline",
  protect,
  authorize("admin", "super_admin"),
  declineTicket
);
router.patch(
  "/admin/tickets/:id/priority",
  protect,
  authorize("admin", "super_admin"),
  updatePriority
);

module.exports = router;
