const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info"
    },
    read: {
      type: Boolean,
      default: false
    },
    link: {
      type: String, // Optional link to redirect user when they click the notification
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
