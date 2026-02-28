const Redis = require("ioredis");

// Main client (for get/set)
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null;
    return Math.min(times * 100, 2000);
  },
});

// Separate subscriber client
const redisSubscriber = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

// ✅ Use READY instead of CONNECT
redis.on("ready", () => {
  console.log("Redis Connected & Ready");
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

redis.on("close", () => {
  console.log("Redis Connection Closed");
});

// Enable keyspace events using subscriber
redisSubscriber.on("ready", async () => {
  try {
    await redisSubscriber.config(
      "SET",
      "notify-keyspace-events",
      "Ex"
    );
    console.log("Redis keyspace events enabled");
  } catch (err) {
    console.error("Could not enable keyspace events:", err.message);
  }
});

module.exports = { redis, redisSubscriber };