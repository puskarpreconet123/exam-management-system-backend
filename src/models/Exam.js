const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
    },

    distribution: {
      easy: { type: Number, required: true, min: 0, max: 100 },
      medium: { type: Number, required: true, min: 0, max: 100 },
      hard: { type: Number, required: true, min: 0, max: 100 },
    },

    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    // 'fixed' = starts at a specific time, students have 30-min window to join
    // 'range' = available between startTime and endTime, student can join anytime in window
    schedulingType: {
      type: String,
      enum: ["fixed", "range"],
      default: "fixed",
    },

    startTime: {
      type: Date,
      required: true,
    },

    // Required only when schedulingType === 'range'
    endTime: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "completed"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes for time-based queries
examSchema.index({ startTime: 1 });
examSchema.index({ endTime: 1 });

// Validate distribution
examSchema.pre("validate", async function () {
  const totalPercentage =
    this.distribution.easy +
    this.distribution.medium +
    this.distribution.hard;

  if (totalPercentage !== 100) {
    throw new Error("Distribution percentage must equal 100");
  }

  // For range type, endTime is required and must be after startTime
  if (this.schedulingType === "range") {
    if (!this.endTime) {
      throw new Error("endTime is required for range-type exams");
    }
    if (this.endTime <= this.startTime) {
      throw new Error("endTime must be after startTime");
    }
  }
});

module.exports = mongoose.model("Exam", examSchema);