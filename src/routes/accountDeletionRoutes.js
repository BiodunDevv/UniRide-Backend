const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const {
  requestDeletionCode,
  verifyDeletionCode,
  submitPublicDeletionRequest,
  cancelPublicDeletionRequest,
  getAuthenticatedDeletionStatus,
  submitAuthenticatedDeletionRequest,
  cancelAuthenticatedDeletionRequest,
} = require("../controllers/accountDeletionController");

router.post("/request-code", requestDeletionCode);
router.post("/verify-code", verifyDeletionCode);
router.post("/request", submitPublicDeletionRequest);
router.post("/cancel", cancelPublicDeletionRequest);

router.get("/status", protect, getAuthenticatedDeletionStatus);
router.post("/authenticated/request", protect, submitAuthenticatedDeletionRequest);
router.post("/authenticated/cancel", protect, cancelAuthenticatedDeletionRequest);

module.exports = router;
