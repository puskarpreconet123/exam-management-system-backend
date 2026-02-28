const mongoose = require("mongoose");

const examAttemptSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    startedAt: {
      type: Date,
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    submittedAt: Date,

    status: {
      type: String,
      enum: ["active", "submitted", "timeout"],
      default: "active",
    },

    score: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { timestamps: true }
);

// Prevent duplicate attempts
examAttemptSchema.index({ examId: 1, userId: 1 }, { unique: true });

// Optimize frequent queries
examAttemptSchema.index({ examId: 1, status: 1 });

// Time validation
examAttemptSchema.pre("validate", async function () {
  if (this.expiresAt <= this.startedAt) {
    throw new Error("expiresAt must be after startedAt");
  }

  if (this.submittedAt && this.submittedAt < this.startedAt) {
    throw new Error("submittedAt cannot be before startedAt");
  }
});

module.exports = mongoose.model("ExamAttempt", examAttemptSchema);