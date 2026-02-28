const mongoose = require("mongoose");
const ExamAttempt = require("../models/ExamAttempt");

module.exports = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user?.id;

    // 1️⃣ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({
        message: "Invalid attempt ID",
      });
    }

    // 2️⃣ Fetch minimal fields only
    const attempt = await ExamAttempt.findById(attemptId)
      .select("userId examId status expiresAt")
      .lean();

    if (!attempt) {
      return res.status(404).json({
        message: "Attempt not found",
      });
    }

    // 3️⃣ Ownership check (CRITICAL)
    if (attempt.userId.toString() !== userId) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }

    // 4️⃣ Status check
    if (attempt.status !== "active") {
      return res.status(400).json({
        message: "Exam not active",
      });
    }

    // 5️⃣ Expiration check
    if (new Date() > attempt.expiresAt) {
      return res.status(400).json({
        message: "Exam time expired",
      });
    }

    req.attempt = attempt;

    next();

  } catch (err) {
    console.error("validateActiveAttempt error:", err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};