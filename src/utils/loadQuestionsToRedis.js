const Question = require("../models/Question");
const { redis } = require("../config/redis");

const loadQuestionsToRedis = async () => {
  try {
    console.log("Loading questions into Redis...");

    // 1️⃣ Single DB query
    const questions = await Question.find({})
      .select("_id difficulty")
      .lean();

    const grouped = {
      easy: [],
      medium: [],
      hard: [],
    };

    for (let q of questions) {
      if (grouped[q.difficulty]) {
        grouped[q.difficulty].push(q._id.toString());
      }
    }

    const pipeline = redis.pipeline();

    // 2️⃣ Use pipeline for better performance
    for (let level of Object.keys(grouped)) {
      const key = `questions:${level}`;

      pipeline.del(key);

      if (grouped[level].length > 0) {
        pipeline.sadd(key, ...grouped[level]);
      }

      console.log(
        `Prepared ${grouped[level].length} ${level} questions`
      );
    }

    await pipeline.exec();

    console.log("Questions successfully loaded into Redis");

  } catch (error) {
    console.error("Failed to load questions into Redis:", error);
  }
};

module.exports = loadQuestionsToRedis;