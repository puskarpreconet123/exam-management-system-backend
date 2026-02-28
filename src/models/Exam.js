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

    startTime: {
      type: Date,
      required: true,
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

// Index for time-based queries
examSchema.index({ startTime: 1 });

// Validate distribution
examSchema.pre("validate", async function () {
  const totalPercentage =
    this.distribution.easy +
    this.distribution.medium +
    this.distribution.hard;

  if (totalPercentage !== 100) {
    throw new Error("Distribution percentage must equal 100");
  }
});

// Virtual endTime (computed, not stored)
examSchema.virtual("endTime").get(function () {
  return new Date(this.startTime.getTime() + this.duration * 60000);
});

module.exports = mongoose.model("Exam", examSchema);