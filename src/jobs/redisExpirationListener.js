const { redisSubscriber } = require("../config/redis");
const examService = require("../services/examService");

exports.startRedisExpiryListener = async () => {
  try {
    // Enable keyspace expired events (safe to call again)
    await redisSubscriber.config(
      "SET",
      "notify-keyspace-events",
      "Ex"
    );

    await redisSubscriber.subscribe("__keyevent@0__:expired");

    redisSubscriber.on("message", async (channel, message) => {
      if (message.startsWith("attempt:")) {
        const attemptId = message.split(":")[1];

        try {
          console.log("Redis expired attempt:", attemptId);

          const ExamAttempt = require("../models/ExamAttempt");

          const attempt = await ExamAttempt.findById(attemptId)
            .select("userId status")
            .lean();

          if (!attempt || attempt.status !== "active") return;

          const { examQueue } = require("../queues/examQueue");
          await examQueue.add("auto-submit", {
            attemptId,
            userId: attempt.userId.toString(),
            source: "redis-expiration"
          }, { jobId: `submit:${attemptId}` });

          console.log("Queued auto-submit via Redis:", attemptId);

        } catch (err) {
          console.error("Redis auto-submit failed:", err.message);
        }
      }
    });

    console.log("Redis expiration listener started");

  } catch (err) {
    console.error("Failed to start Redis expiry listener:", err.message);
  }
};