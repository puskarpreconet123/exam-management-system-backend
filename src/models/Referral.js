const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      uppercase: true,
      trim: true
    },
    schoolName: {
      type: String,
      required: true,
      trim: true
    },
    paymentType: {
      type: String,
      enum: ['online', 'offline'],
      required: true,
      default: 'offline'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", referralSchema);
