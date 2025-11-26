const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Department:
 *       type: object
 *       required:
 *         - name
 *         - college_id
 *       properties:
 *         name:
 *           type: string
 *           description: Department name
 *         code:
 *           type: string
 *           description: Optional department code
 *         college_id:
 *           type: string
 *           description: Reference to College
 *         created_by:
 *           type: string
 *           description: Admin ID who created the department
 *         created_at:
 *           type: string
 *           format: date-time
 */

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: [200, 'Department name cannot exceed 200 characters'],
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Department code cannot exceed 20 characters'],
    },
    college_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: [true, 'College ID is required'],
      index: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Compound index for unique department per college
departmentSchema.index({ name: 1, college_id: 1 }, { unique: true });
departmentSchema.index({ code: 1 });

module.exports = mongoose.model('Department', departmentSchema);
