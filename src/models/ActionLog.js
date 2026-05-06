const mongoose = require("mongoose");

const actionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    employeeId: {
      type: String
    },
    userName: {
      type: String,
      required: true
    },
    performedByRole: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true
    },
    targetId: {
      type: String
    },
    targetModel: {
      type: String
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActionLog", actionLogSchema);
