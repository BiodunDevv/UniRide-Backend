const express = require("express");
const router = express.Router();
const {
  getPublicReviews,
  createReview,
  getMyReview,
  deleteMyReview,
  getAllReviews,
  toggleFeatured,
  toggleApproval,
  adminDeleteReview,
  requestReviewCode,
  verifyReviewCode,
  submitReviewByEmail,
  deleteReviewByEmail,
} = require("../controllers/reviewController");
const { protect } = require("../middlewares/authMiddleware");
const authorize = require("../middlewares/roleMiddleware");

// ── Public ──────────────────────────────────────────────────────────────────
router.get("/public", getPublicReviews);

// ── Email-based review flow (no login needed) ───────────────────────────────
router.post("/request-code", requestReviewCode);
router.post("/verify-code", verifyReviewCode);
router.post("/submit-by-email", submitReviewByEmail);
router.post("/delete-by-email", deleteReviewByEmail);

// ── Authenticated users ─────────────────────────────────────────────────────
router.post("/", protect, createReview);
router.get("/me", protect, getMyReview);
router.delete("/me", protect, deleteMyReview);

// ── Admin ───────────────────────────────────────────────────────────────────
router.get("/all", protect, authorize("admin", "super_admin"), getAllReviews);
router.patch(
  "/:id/featured",
  protect,
  authorize("admin", "super_admin"),
  toggleFeatured,
);
router.patch(
  "/:id/approval",
  protect,
  authorize("admin", "super_admin"),
  toggleApproval,
);
router.delete(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  adminDeleteReview,
);

module.exports = router;
