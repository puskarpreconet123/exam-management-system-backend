const { Queue, Worker } = require("bullmq");
const Redis = require("ioredis");
const examService = require("../services/examService");

// BullMQ requires maxRetriesPerRequest to be null
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_URL && process.env.REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined
});

// 1. Create the Queue
const examQueue = new Queue("exam-submissions", { connection });

// 2. Create the Worker
const examWorker = new Worker(
  "exam-submissions",
  async (job) => {
    const { attemptId, userId, source } = job.data;
    console.log(`[BullMQ] Processing submit exam job ${job.id} for attempt ${attemptId} from ${source}`);

    try {
      // Call the heavy service method
      await examService.submitExamService(attemptId, userId);
      console.log(`[BullMQ] Successfully processed attempt ${attemptId}`);
      return { success: true, attemptId };
    } catch (err) {
      console.error(`[BullMQ] Failed to process attempt ${attemptId}:`, err.message);
      // Depending on error, we might want to throw to let BullMQ retry or mark failed
      throw err;
    }
  },
  {
    connection,
    concurrency: 20, // process up to 20 submissions concurrently based on DB capacity
  }
);

examWorker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

examWorker.on("failed", (job, err) => {
  console.error(`[BullMQ] Job ${job.id} failed:`, err.message);
});

module.exports = { examQueue, examWorker };
