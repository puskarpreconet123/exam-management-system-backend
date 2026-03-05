const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    options: {
      type: [
        {
          label: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
      validate: {
        validator: (arr) => arr.length >= 2,
        message: "At least 2 options required",
      },
    },

    correctAnswer: {
      type: String,
      required: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index for fast question picking
questionSchema.index({ subject: 1, difficulty: 1 });

// Ensure correctAnswer matches options
questionSchema.pre("validate", async function () {
  const optionLabels = this.options.map((o) => o.label);

  if (!optionLabels.includes(this.correctAnswer)) {
    throw new Error("correctAnswer must match one of the options");
  }

});

module.exports = mongoose.model("Question", questionSchema);