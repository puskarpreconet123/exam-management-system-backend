require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { initSocket } = require("./src/config/socket");

const app = require("./src/app");
const connectDB = require("./src/config/db");
const loadQuestionsToRedis = require("./src/utils/loadQuestionsToRedis");
const { startRedisExpiryListener } = require("./src/jobs/redisExpirationListener");
const { startFallbackCron } = require("./src/jobs/cronJob");
const { startRedisSyncWorker } = require("./src/jobs/redisSyncToDB");
require("./src/queues/examQueue"); // Import BullMQ worker

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO using the new shared config
initSocket(server);

// ----------- START SERVER FUNCTION -----------
const startServer = async () => {
  try {
    // Connect Database
    await connectDB();
    console.log("Database connected");

    // Load Redis Cache
    await loadQuestionsToRedis();
    console.log("Questions loaded into Redis");

    // Start Server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    startRedisSyncWorker();
    startRedisExpiryListener(); // PRIMARY
    startFallbackCron();        // BACKUP
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

// ----------- CRASH HANDLING -----------

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  shutdown();
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown();
});

// ----------- GRACEFUL SHUTDOWN -----------

const shutdown = async () => {
  console.log("Shutting down server...");

  server.close(async () => {
    console.log("HTTP server closed");

    try {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
      process.exit(1);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);