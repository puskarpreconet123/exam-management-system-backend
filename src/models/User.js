const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      unique: true,
      required: true
    },
    contact: {
      type: String,
      sparse: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "student"],
      default: "student",
    },
    
    // Verification Flags
    emailVerified: {
      type: Boolean,
      default: false
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },

    // Student Specifics
    studentDetails: {
      dob: String,
      board: { type: String, default: "General" },
      schoolName: String,
      className: { type: String, default: "General" },
      studentContact: {
        type: String,
        sparse: true, // Unique only if it exists, to prevent duplicate nulls across admin users
        unique: true
      }
    },

    // Guardian Details
    guardianDetails: {
      guardianName: String,
      guardianContact: String,
      guardianEmail: String
    },

    // Address
    address: {
      country: { type: String, default: "India" },
      state: String,
      customState: String,
      district: String,
      customDistrict: String,
      locality: String,
      pin: String
    },

    // Payment Tracking
    paymentStatus: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending"
    },
    transactionId: String,

    // Referral
    usedReferralCode: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);