const mongoose = require("mongoose");

const suspiciousLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamAttempt",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "TAB_SWITCH",
        "MULTIPLE_LOGIN",
        "COPY_ATTEMPT",
        "WINDOW_BLUR",
        "DEVICE_SWITCH",
      ],
      required: true,
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    flagged: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index for admin queries
suspiciousLogSchema.index({ examId: 1, flagged: 1 });

module.exports = mongoose.model("SuspiciousLog", suspiciousLogSchema);