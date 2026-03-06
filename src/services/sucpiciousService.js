const SuspiciousLog = require("../models/SuspiciousLog");
const { getIO } = require("../config/socket");

exports.logSuspiciousActivity = async ({
  userId,
  examId,
  attemptId = null,
  type,
  metadata = {},
}) => {
  try {
    const filter = attemptId ? { attemptId, type } : { userId, examId, type };
    const update = {
      $inc: { count: 1 },
      $set: {
        userId,
        examId,
        metadata,
        flagged: true,
      },
    };

    const log = await SuspiciousLog.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    });

    // Reliable population for the live feed
    const populatedLog = await SuspiciousLog.findById(log._id)
      .populate("userId", "name email")
      .populate("attemptId", "status")
      .lean();

    // Push to admins
    try {
      const io = getIO();
      console.log(`Emitting violation log to admin_room for: ${populatedLog.userId?.name || 'Unknown student'}`);
      io.to("admin_room").emit("new_suspicious_log", populatedLog);
    } catch (err) {
      console.error("Socket emit failed:", err.message);
    }

  } catch (err) {
    console.error("Logging failed:", err.message);
  }
};