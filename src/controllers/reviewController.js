const Review = require("../models/Review");
const User = require("../models/User");
const generateVerificationCode = require("../utils/generateVerificationCode");
const { sendEmail } = require("../config/brevo");

// In-memory store for review verification codes (short-lived, no DB needed)
const reviewCodes = new Map(); // email → { code, expires, user_id }

// ── Public: Get featured reviews (for landing page) ─────────────────────────
const getPublicReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ is_featured: true, is_approved: true })
      .populate("user_id", "name profile_picture role")
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};

// ── Auth: Create or update a review ─────────────────────────────────────────
const createReview = async (req, res, next) => {
  try {
    const { rating, title, message } = req.body;

    if (!rating || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Rating, title, and message are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (title.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Title must be 100 characters or less",
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Message must be 500 characters or less",
      });
    }

    // Check if user already has a review — update it
    let review = await Review.findOne({ user_id: req.user._id });

    if (review) {
      review.rating = rating;
      review.title = title.trim();
      review.message = message.trim();
      review.is_approved = true; // Re-approve on edit (admin can revoke)
      await review.save();

      return res.status(200).json({
        success: true,
        message: "Review updated successfully",
        data: review,
      });
    }

    // Create new review
    review = await Review.create({
      user_id: req.user._id,
      rating,
      title: title.trim(),
      message: message.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// ── Auth: Get my review ─────────────────────────────────────────────────────
const getMyReview = async (req, res, next) => {
  try {
    const review = await Review.findOne({ user_id: req.user._id });

    res.status(200).json({
      success: true,
      data: review || null,
    });
  } catch (error) {
    next(error);
  }
};

// ── Auth: Delete my review ──────────────────────────────────────────────────
const deleteMyReview = async (req, res, next) => {
  try {
    const review = await Review.findOneAndDelete({ user_id: req.user._id });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "No review found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Get all reviews ──────────────────────────────────────────────────
const getAllReviews = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, is_featured, is_approved } = req.query;
    const filter = {};

    if (is_featured !== undefined) filter.is_featured = is_featured === "true";
    if (is_approved !== undefined) filter.is_approved = is_approved === "true";

    const reviews = await Review.find(filter)
      .populate("user_id", "name email profile_picture role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Review.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: reviews.length,
      total,
      page: Number(page),
      data: reviews,
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Toggle featured status ───────────────────────────────────────────
const toggleFeatured = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    review.is_featured = !review.is_featured;
    await review.save();

    res.status(200).json({
      success: true,
      message: `Review ${review.is_featured ? "featured" : "unfeatured"} successfully`,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Toggle approval status ───────────────────────────────────────────
const toggleApproval = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    review.is_approved = !review.is_approved;
    if (!review.is_approved) review.is_featured = false; // Unapproved can't be featured
    await review.save();

    res.status(200).json({
      success: true,
      message: `Review ${review.is_approved ? "approved" : "unapproved"} successfully`,
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// ── Admin: Delete a review ──────────────────────────────────────────────────
const adminDeleteReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ── Email-based: Request verification code ──────────────────────────────────
const requestReviewCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "No UniRide account found with this email. Download the app to create an account and start riding!",
      });
    }

    const code = generateVerificationCode();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    reviewCodes.set(email.toLowerCase().trim(), {
      code,
      expires,
      user_id: user._id.toString(),
    });

    // Clean up expired codes periodically
    for (const [key, val] of reviewCodes.entries()) {
      if (val.expires < Date.now()) reviewCodes.delete(key);
    }

    // Send email with code
    try {
      await sendEmail({
        to: email.toLowerCase().trim(),
        subject: "Your UniRide Review Verification Code",
        htmlContent: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #042F40; margin: 0;">UniRide</h2>
              <p style="color: #6B7280; font-size: 14px; margin: 8px 0 0;">Review Verification</p>
            </div>
            <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; text-align: center;">
              <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Hi ${user.name}, here's your verification code to leave a review:</p>
              <div style="background: #042F40; color: white; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 24px; border-radius: 8px; display: inline-block;">${code}</div>
              <p style="color: #9CA3AF; font-size: 12px; margin: 16px 0 0;">This code expires in 10 minutes.</p>
            </div>
            <p style="color: #9CA3AF; font-size: 11px; text-align: center; margin-top: 24px;">© ${new Date().getFullYear()} UniRide. All rights reserved.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send review code email:", emailErr.message);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
      data: { name: user.name },
    });
  } catch (error) {
    next(error);
  }
};

// ── Email-based: Verify code and get user info ──────────────────────────────
const verifyReviewCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and code are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = reviewCodes.get(normalizedEmail);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new one.",
      });
    }

    if (stored.expires < Date.now()) {
      reviewCodes.delete(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: "Verification code expired. Please request a new one.",
      });
    }

    if (stored.code !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Code is valid — get user info and check for existing review
    const user = await User.findById(stored.user_id).select(
      "name email role profile_picture",
    );
    const existingReview = await Review.findOne({ user_id: stored.user_id });

    // Don't delete code yet — they'll need it for submit
    // Extend expiry by 30 minutes for the review session
    stored.expires = Date.now() + 30 * 60 * 1000;
    stored.verified = true;

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          profile_picture: user.profile_picture,
        },
        existing_review: existingReview || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── Email-based: Submit review ──────────────────────────────────────────────
const submitReviewByEmail = async (req, res, next) => {
  try {
    const { email, code, rating, title, message } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = reviewCodes.get(normalizedEmail);

    if (!stored || !stored.verified || stored.expires < Date.now()) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please verify your email again.",
      });
    }

    if (stored.code !== code) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    if (!rating || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Rating, title, and message are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Create or update review
    let review = await Review.findOne({ user_id: stored.user_id });

    if (review) {
      review.rating = rating;
      review.title = title.trim();
      review.message = message.trim();
      review.is_approved = true;
      await review.save();
    } else {
      review = await Review.create({
        user_id: stored.user_id,
        rating,
        title: title.trim(),
        message: message.trim(),
      });
    }

    // Clean up used code
    reviewCodes.delete(normalizedEmail);

    res.status(201).json({
      success: true,
      message:
        review.isNew === false
          ? "Review updated successfully"
          : "Review submitted successfully",
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

// ── Email-based: Delete review ──────────────────────────────────────────────
const deleteReviewByEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const normalizedEmail = (email || "").toLowerCase().trim();
    const stored = reviewCodes.get(normalizedEmail);

    if (!stored || !stored.verified || stored.expires < Date.now()) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please verify your email again.",
      });
    }

    if (stored.code !== code) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    const review = await Review.findOneAndDelete({ user_id: stored.user_id });
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "No review found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
