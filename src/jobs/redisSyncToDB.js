const { redis } = require("../config/redis");
const ExamResponse = require("../models/ExamResponse");

exports.startRedisSyncWorker = () => {
  setInterval(async () => {
    try {
      const attemptIds = await redis.smembers("dirty_attempts");
      if (!attemptIds.length) return;

      const operations = [];

      for (const id of attemptIds) {
        const answersKey = `answers:${id}`;

        const answersData = await redis.get(answersKey);
        if (!answersData) continue;

        const parsedAnswers = JSON.parse(answersData);

        // ✅ Convert object → array for Mongo schema
        const formattedAnswers = Object.entries(parsedAnswers).map(
          ([questionId, selectedOption]) => ({
            questionId,
            selectedOption
          })
        );

        operations.push({
          updateOne: {
            filter: { attemptId: id },
            update: {
              $set: {
                attemptId: id,
                answers: formattedAnswers,
                updatedAt: new Date()
              }
            },
            upsert: true,
          }
        });
      }

      if (operations.length) {
        await ExamResponse.bulkWrite(operations);

        // ✅ Remove only synced attemptIds from dirty set
        await redis.srem("dirty_attempts", ...attemptIds);

        console.log("Redis → Mongo synced:", operations.length);
      }

    } catch (err) {
      console.error("Redis sync error:", err.message);
    }
  }, 2000);

  console.log("Redis Sync Worker Started");
};