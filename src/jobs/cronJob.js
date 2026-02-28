const cron = require("node-cron");
const ExamAttempt = require("../models/ExamAttempt");
const examService = require("../services/examService");

exports.startFallbackCron = () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const now = new Date();

      const expiredAttempts = await ExamAttempt.find({
        status: "active",
        expiresAt: { $lte: now },
      })
        .select("_id userId")
        .limit(100); // prevent overload

      for (let attempt of expiredAttempts) {
        try {
          await examService.submitExamService(
            attempt._id,
            attempt.userId.toString()
          );
        } catch (err) {
          // ignore already submitted
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