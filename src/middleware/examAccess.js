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
      .select("startTime endTime duration schedulingType")
      .lean();

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found",
      });
    }

    const now = new Date();

    // 3️⃣ Exam not started yet
    if (now < exam.startTime) {
      return res.status(400).json({
        message: "Exam not started yet",
      });
    }

    // 4️⃣ For range-type exams: check endTime boundary
    if (exam.schedulingType === "range") {
      if (exam.endTime && now > exam.endTime) {
        return res.status(400).json({
          message: "Exam window has closed",
        });
      }
      // No late-entry restriction for range exams; skip to attempt check
    } else {
      // 5️⃣ Fixed-type: check 30-min late entry window (only if no existing attempt)
      const existingAttemptCheck = await ExamAttempt.findOne({ examId, userId })
        .select("_id status expiresAt")
        .lean();

      if (!existingAttemptCheck) {
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
      req.attempt = existingAttemptCheck || null;
      return next();
    }

    // 6️⃣ Fetch existing attempt for range-type exams
    const existingAttempt = await ExamAttempt.findOne({ examId, userId })
      .select("_id status expiresAt")
      .lean();

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