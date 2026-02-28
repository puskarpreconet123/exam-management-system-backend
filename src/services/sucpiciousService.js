const SuspiciousLog = require("../models/SuspiciousLog");

exports.logSuspiciousActivity = async ({
  userId,
  examId ,
  attemptId = null,
  type,
  metadata = {},
}) => {
  try {
    // Don't await — fire and forget
    SuspiciousLog.create({
      userId,
      examId,
      attemptId,
      type,
      metadata,
      flagged: true,
    }).catch((err) => {
      console.error("SuspiciousLog error:", err.message);
    });
  } catch (err) {
    console.error("Logging failed:", err.message);
  }
};