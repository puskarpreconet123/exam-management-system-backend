const cron = require("node-cron");
const ExamAttempt = require("../models/ExamAttempt");
const examService = require("../services/examService");
const { updateAllExamsStatus } = require("../utils/examStatusUpdater");

exports.startFallbackCron = () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const now = new Date();
      await updateAllExamsStatus(now);

      const expiredAttempts = await ExamAttempt.find({
        status: "active",
        expiresAt: { $lte: now },
      })
        .select("_id userId")
        .limit(100); // prevent overload

      const { examQueue } = require("../queues/examQueue");

      for (let attempt of expiredAttempts) {
        try {
          await examQueue.add("cron-submit", {
            attemptId: attempt._id,
            userId: attempt.userId.toString(),
            source: "cron"
          }, { jobId: `submit_${attempt._id}` });
        } catch (err) {
          // ignore already queued
        }
      }

      if (expiredAttempts.length > 0)
        console.log("Fallback cron handled:", expiredAttempts.length);

    } catch (err) {
      console.error("Fallback cron error:", err);
    }
  });

  console.log("Fallback cron started");
};