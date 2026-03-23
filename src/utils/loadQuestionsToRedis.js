const Question = require("../models/Question");
const { redis } = require("../config/redis");

const loadQuestionsToRedis = async () => {
  try {
    console.log("Loading questions into Redis...");

    // 1️⃣ Single DB query
    const questions = await Question.find({})
      .select("_id difficulty subject")
      .lean();

    const grouped = {};

    for (let q of questions) {
      if (!q.subject) continue;
      const key = `${q.subject}:${q.difficulty}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(q._id.toString());
    }

    const pipeline = redis.pipeline();

    // Delete existing keys? Wait, we don't know all existing keys in redis. 
    // It's better to fetch all keys matching questions:* and delete them.
    const keys = await redis.keys("questions:*");
    if (keys.length > 0) {
      pipeline.del(...keys);
    }

    // 2️⃣ Use pipeline for better performance
    for (let key of Object.keys(grouped)) {
      const redisKey = `questions:${key}`;

      if (grouped[key].length > 0) {
        pipeline.sadd(redisKey, ...grouped[key]);
      }

      console.log(
        `Prepared ${grouped[key].length} questions for ${key}`
      );
    }

    await pipeline.exec();

    console.log("Questions successfully loaded into Redis");

  } catch (error) {
    console.error("Failed to load questions into Redis:", error);
  }
};

module.exports = loadQuestionsToRedis;