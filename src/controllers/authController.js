const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { redis } = require("../config/redis");
const { log } = require("console");

// ================= REGISTER =================
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({
        message: "All fields required",
      });

    const existing = await User.findOne({ email });

    if (existing)
      return res.status(400).json({
        message: "Email already registered",
      });

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      // role auto = student
    });

    res.status(201).json({
      message: "Registered successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Generic error message for security
    const authError = { message: "Invalid email or password" };

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json(authError);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json(authError);

    // 🔐 Generate sessionId
    const sessionId = crypto.randomUUID();

    // 🚫 Prevent parallel login (Note: Ensure redis is connected)
    try {
      
      const result = await redis.set(
      `user_session:${user._id}`,
      sessionId,
      "EX",
      60 * 60 * 24,
      // "NX"
    );

    if (!result) {
      return res.status(403).json({
        message: "Account is already active on another device.",
      });
    }
    console.log("Existing session:", result);
console.log("Type:", typeof result);

      // ✅ Save session in Redis
      await redis.set(
        `user_session:${user._id}`,
        sessionId,
        "EX",
        60 * 60 * 24, // 24h
      );
    } catch (redisErr) {
      console.error("Redis Error:", redisErr);
      // Optional: decide if you want to block login if Redis is down
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err); // Log the full error for you
    res.status(500).json({ message: "Internal Server Error" }); // Clean message for user
  }
};

// ================= LOGOUT =================
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await redis.del(`user_session:${userId}`);

    res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};