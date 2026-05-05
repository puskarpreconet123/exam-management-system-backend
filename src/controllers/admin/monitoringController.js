const mongoose = require("mongoose");
const SuspiciousLog = require("../../models/SuspiciousLog");
const ExamAttempt = require("../../models/ExamAttempt");
const examService = require("../../services/examService");
const { getIO } = require("../../config/socket");
const notificationService = require("../../services/notificationService");

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

    if (examId && mongoose.Types.ObjectId.isValid(examId)) 
        query.examId = new mongoose.Types.ObjectId(examId);
    if (userId && mongoose.Types.ObjectId.isValid(userId)) 
        query.userId = new mongoose.Types.ObjectId(userId);
    if (attemptId && mongoose.Types.ObjectId.isValid(attemptId)) 
        query.attemptId = new mongoose.Types.ObjectId(attemptId);
        
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

    // Calculate Summary Stats
    const stats = {
        mostCommon: 'None',
        mostCommonPercent: '0%',
        peakTime: 'N/A',
        forceTerminations: 0
    };

    try {
        const typeAgg = await SuspiciousLog.aggregate([
            { $match: query },
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        if (typeAgg.length > 0) {
            stats.mostCommon = typeAgg[0]._id;
            stats.mostCommonPercent = total > 0 ? `${Math.round((typeAgg[0].count / total) * 100)}% of violations` : '0%';
        }

        const peakAgg = await SuspiciousLog.aggregate([
            { $match: query },
            { $project: { hour: { $hour: "$createdAt" } } },
            { $group: { _id: "$hour", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);

        if (peakAgg.length > 0) {
            const h = peakAgg[0]._id;
            stats.peakTime = `${String(h).padStart(2, '0')}:00 - ${String((h + 1) % 24).padStart(2, '0')}:00`;
        }

        stats.forceTerminations = await ExamAttempt.countDocuments({ isForceSubmitted: true });

    } catch (statErr) {
        console.error('Error calculating suspicious stats:', statErr);
    }

    res.json({
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: logs,
      stats
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

    await ExamAttempt.findByIdAndUpdate(attemptId, { isForceSubmitted: true });

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

    // ✨ Notify Student via Persistent Notification
    await notificationService.notifyUser(
      attempt.userId,
      "Exam Terminated",
      "Your exam session has been terminated by an administrator.",
      "error"
    );

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.forceSubmitBulk = async (req, res) => {
  try {
    const { attemptIds } = req.body;
    if (!Array.isArray(attemptIds) || attemptIds.length === 0) {
      return res.status(400).json({ message: "No attempt IDs provided" });
    }

    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds }, status: "active" }).select("userId").lean();
    
    let successCount = 0;
    const io = getIO();

    for (const attempt of attempts) {
      try {
        await examService.submitExamService(attempt._id.toString(), attempt.userId.toString());
        await ExamAttempt.findByIdAndUpdate(attempt._id, { isForceSubmitted: true });
        
        io.to(`exam_${attempt._id}`).emit("exam_terminated", {
          message: "Your exam session has been terminated by an administrator.",
        });

        // ✨ Persistent Notification
        await notificationService.notifyUser(
          attempt.userId,
          "Exam Terminated",
          "Your exam session has been terminated by an administrator.",
          "error"
        );

        successCount++;
      } catch (e) {
        console.error(`Failed to force submit attempt ${attempt._id}:`, e.message);
      }
    }

    res.json({ message: `Successfully force terminated ${successCount} attempts` });

    // ✨ Bulk notify handled in loop above? 
    // Actually, I should add it to the loop.
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.dismissSuspiciousBulk = async (req, res) => {
  try {
    const { logIds } = req.body;
    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: "No log IDs provided" });
    }

    await SuspiciousLog.deleteMany({ _id: { $in: logIds } });

    res.json({ message: "Selected logs dismissed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};