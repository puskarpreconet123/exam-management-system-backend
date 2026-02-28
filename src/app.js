const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const examRoutes = require("./routes/examRoutes");

const app = express();

// Security headers
app.use(helmet());

// Compress responses
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5174",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Body parser with limit
app.use(express.json({ limit: "1mb" }));

// Health Check
app.get("/", (req, res) => {
  res.send("Exam System API Running");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;