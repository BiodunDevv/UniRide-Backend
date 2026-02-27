const mongoose = require("mongoose");

const languageSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Language code is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: [true, "Language name is required"],
      trim: true,
    },
    native_name: {
      type: String,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    added_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

const Language = mongoose.model("Language", languageSchema);

module.exports = Language;
