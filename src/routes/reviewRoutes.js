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

/**
 * @swagger
 * /api/reviews/public:
 *   get:
 *     summary: Get featured & approved reviews
 *     description: Returns up to 20 featured, approved reviews for the landing page. No authentication required.
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: List of featured reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 */
router.get("/public", getPublicReviews);

// ── Email-based review flow (no login needed) ───────────────────────────────

/**
 * @swagger
 * /api/reviews/request-code:
 *   post:
 *     summary: Request a review verification code
 *     description: Sends a 6-digit code to the user's email. The user must have a UniRide account. Code expires in 10 minutes.
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification code sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *       404:
 *         description: No account found with this email
 */
router.post("/request-code", requestReviewCode);

/**
 * @swagger
 * /api/reviews/verify-code:
 *   post:
 *     summary: Verify the email code
 *     description: Verifies the code sent to the user's email and returns user info + existing review if any. Extends session to 30 minutes.
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         profile_picture:
 *                           type: string
 *                     existing_review:
 *                       $ref: '#/components/schemas/Review'
 *       400:
 *         description: Invalid or expired code
 */
router.post("/verify-code", verifyReviewCode);

/**
 * @swagger
 * /api/reviews/submit-by-email:
 *   post:
 *     summary: Submit a review via email verification
 *     description: Creates or updates a review using the email verification flow. Requires a previously verified code.
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, rating, title, message]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *                 maxLength: 100
 *               message:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Review submitted/updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       401:
 *         description: Session expired or invalid code
 */
router.post("/submit-by-email", submitReviewByEmail);

/**
 * @swagger
 * /api/reviews/delete-by-email:
 *   post:
 *     summary: Delete a review via email verification
 *     description: Deletes the user's review using the email verification flow. Requires a previously verified code.
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review deleted
 *       401:
 *         description: Session expired or invalid code
 *       404:
 *         description: No review found
 */
router.post("/delete-by-email", deleteReviewByEmail);

// ── Authenticated users ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Create or update your review
 *     description: Creates a new review or updates the existing one for the authenticated user. Each user can have only one review.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating, title, message]
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *                 maxLength: 100
 *               message:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Review updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       201:
 *         description: Review created
 *       400:
 *         description: Missing or invalid fields
 */
router.post("/", protect, createReview);

/**
 * @swagger
 * /api/reviews/me:
 *   get:
 *     summary: Get my review
 *     description: Returns the authenticated user's review, or null if they haven't written one.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's review or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/Review'
 *                     - type: "null"
 */
router.get("/me", protect, getMyReview);

/**
 * @swagger
 * /api/reviews/me:
 *   delete:
 *     summary: Delete my review
 *     description: Deletes the authenticated user's review.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review deleted
 *       404:
 *         description: No review found
 */
router.delete("/me", protect, deleteMyReview);

// ── Admin ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/reviews/all:
 *   get:
 *     summary: Get all reviews (admin)
 *     description: Returns paginated list of all reviews with optional filtering by featured/approved status.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: is_featured
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: is_approved
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: Paginated list of reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 total:
 *                   type: number
 *                 page:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 */
router.get("/all", protect, authorize("admin", "super_admin"), getAllReviews);

/**
 * @swagger
 * /api/reviews/{id}/featured:
 *   patch:
 *     summary: Toggle featured status (admin)
 *     description: Toggles whether a review is featured on the landing page.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Featured status toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       404:
 *         description: Review not found
 */
router.patch(
  "/:id/featured",
  protect,
  authorize("admin", "super_admin"),
  toggleFeatured,
);

/**
 * @swagger
 * /api/reviews/{id}/approval:
 *   patch:
 *     summary: Toggle approval status (admin)
 *     description: Toggles whether a review is approved. Unapproved reviews are automatically unfeatured.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Approval status toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       404:
 *         description: Review not found
 */
router.patch(
  "/:id/approval",
  protect,
  authorize("admin", "super_admin"),
  toggleApproval,
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete a review (admin)
 *     description: Permanently deletes any review by ID.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Review deleted
 *       404:
 *         description: Review not found
 */
router.delete(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  adminDeleteReview,
);

module.exports = router;
