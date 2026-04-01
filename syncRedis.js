const mongoose = require("mongoose");
require("dotenv").config();
const { redis } = require("./src/config/redis");
const Question = require("./src/models/Question");

async function syncRedis() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for Redis Sync...");

    // Delete all questions:* keys
    let cursor = '0';
    let keysDeleted = 0;
    do {
      const res = await redis.scan(cursor, 'MATCH', 'questions:*', 'COUNT', 100);
      cursor = res[0];
      const keys = res[1];
      if (keys.length > 0) {
        await redis.del(...keys);
        keysDeleted += keys.length;
      }
    } while (cursor !== '0');
    console.log(`Purged ${keysDeleted} old question keys from Redis.`);

    // Repopulate
    const questions = await Question.find({}).lean();
    console.log(`Found ${questions.length} questions to sync.`);

    let count = 0;
    for (let q of questions) {
      const board = q.board || "General";
      const cls = q.class || "General";
      const key = `questions:${board}:${cls}:${q.subject}:${q.difficulty}`;
      await redis.sadd(key, q._id.toString());
      count++;
    }

    console.log(`Successfully synced ${count} questions to Redis.`);

  } catch (error) {
    console.error("Error syncing Redis:", error);
  } finally {
    await mongoose.disconnect();
    redis.quit();
    process.exit(0);
  }
}

syncRedis();
