const mongoose = require("mongoose");

const examResponseSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamAttempt",
      required: true,
    },

    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],

    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        selectedOption: {
          type: String,
          required: true,
        },
        isCorrectOverride: {
          type: Boolean,
          default: null,
        },
      },
    ],

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Unique response per attempt
examResponseSchema.index({ attemptId: 1 }, { unique: true });

// Optimize exam-based queries
examResponseSchema.index({ examId: 1 });

module.exports = mongoose.model("ExamResponse", examResponseSchema);