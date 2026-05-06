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
      enum: ["admin", "student", "employee"],
      default: "student",
    },
    permissions: {
      type: [String],
      default: [],
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
    usedReferralCode: String,

    // Employee Specifics
    employeeId: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  { timestamps: true }
);

// Auto-generate employeeId for new employees
userSchema.pre("save", async function () {
  if (this.role === "employee" && !this.employeeId) {
    const count = await mongoose.model("User").countDocuments({ role: "employee" });
    const random = Math.floor(1000 + Math.random() * 9000); // 4 digit random
    this.employeeId = `EMP-${count + 1}${random}`;
  }
});

module.exports = mongoose.model("User", userSchema);