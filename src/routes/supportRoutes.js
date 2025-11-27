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
  assignTicket,
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
router.patch(
  "/admin/tickets/:id/assign",
  protect,
  authorize("admin", "super_admin"),
  assignTicket
);
router.patch(
  "/admin/tickets/:id/priority",
  protect,
  authorize("admin", "super_admin"),
  updatePriority
);

module.exports = router;
