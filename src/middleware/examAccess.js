const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const ExamAttempt = require("../models/ExamAttempt");
const suspiciousService = require("../services/sucpiciousService");

module.exports = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const userId = req.user?.id;

    // 1️⃣ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        message: "Invalid exam ID",
      });
    }

    // 2️⃣ Fetch minimal fields only
    const exam = await Exam.findById(examId)
      .select("startTime endTime duration")
      .lean();

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found",
      });
    }

    const now = new Date();

    // 3️⃣ Exam not started
    if (now < exam.startTime) {
      return res.status(400).json({
        message: "Exam not started yet",
      });
    }

    // 4️⃣ Exam fully ended
    if (exam.endTime && now > exam.endTime) {
      return res.status(400).json({
        message: "Exam already ended",
      });
    }

    // 5️⃣ Check existing attempt (minimal fields)
    const existingAttempt = await ExamAttempt.findOne({
      examId,
      userId,
    })
      .select("_id status expiresAt")
      .lean();

    // 6️⃣ Late entry check (only if no attempt)
    if (!existingAttempt) {
      const lateDeadline = new Date(
        new Date(exam.startTime).getTime() + 30 * 60 * 1000
      );

      if (now > lateDeadline) {
        await suspiciousService.logSuspiciousActivity({
          userId,
          examId,
          type: "LATE_START_ATTEMPT",
        });

        return res.status(403).json({
          message: "Start window closed",
        });
      }
    }

    req.exam = exam;
    req.attempt = existingAttempt || null;

    next();

  } catch (err) {
    console.error("examAccess middleware error:", err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};