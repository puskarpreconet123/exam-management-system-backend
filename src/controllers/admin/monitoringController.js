const SuspiciousLog = require("../../models/SuspiciousLog");
const ExamAttempt = require("../../models/ExamAttempt");
const examService = require("../../services/examService");
const { getIO } = require("../../config/socket");

exports.getSuspiciousLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      examId,
      userId,
      attemptId,
      flagged
    } = req.query;

    const query = {};

    if (examId) query.examId = examId;
    if (userId) query.userId = userId;
    if (attemptId) query.attemptId = attemptId;
    if (flagged !== undefined)
      query.flagged = flagged === "true";

    const logs = await SuspiciousLog.find(query)
      .populate("userId", "name email")
      .populate("attemptId", "status")
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await SuspiciousLog.countDocuments(query);

    res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.forceSubmit = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt
      .findById(attemptId)
      .select("userId status")
      .lean();

    if (!attempt)
      return res.status(404).json({
        message: "Attempt not found",
      });

    if (attempt.status !== "active")
      return res.status(400).json({
        message: "Attempt already submitted",
      });

    const result = await examService.submitExamService(
      attemptId,
      attempt.userId.toString()
    );

    // Notify student via socket
    try {
      const io = getIO();
      io.to(`exam_${attemptId}`).emit("exam_terminated", {
        message: "Your exam session has been terminated by an administrator.",
      });
    } catch (err) {
      console.error("Socket notification failed:", err.message);
    }

    res.json({
      message: "Force submitted successfully",
      result,
    });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};