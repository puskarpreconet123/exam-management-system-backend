const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const examRoutes = require("./routes/examRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

// Security headers
app.use(helmet());

// Compress responses
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5174",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  credentials: true
}));

// Body parser with limit and raw body capture for webhooks
app.use(express.json({ 
  limit: "1mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Health Check
app.get("/", (req, res) => {
  res.send("Exam System API Running");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payment", paymentRoutes);


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