const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 30,
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB Connected");

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB Error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("MongoDB Disconnected");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("MongoDB connection closed due to app termination");
      process.exit(0);
    });

  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
};

module.exports = connectDB;