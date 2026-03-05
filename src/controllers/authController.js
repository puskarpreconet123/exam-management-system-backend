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
    let { email, password } = req.body;

    // 🛡️ Handle email sent as object
    if (email && typeof email === "object") {
      email = email.email;
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const authError = { message: "Invalid email or password" };

    // 🔎 Find user
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) return res.status(400).json(authError);

    // 🔑 Check password
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json(authError);

    // 🔐 Generate new sessionId
    const sessionId = crypto.randomUUID();

    const userSessionKey = `user_session:${user._id}`;
    const sessionKey = `session:${sessionId}`;

    // ==============================
    // 🚫 AUTO LOGOUT PREVIOUS DEVICE
    // ==============================

    // 1️⃣ Check if old session exists
    const oldSessionId = await redis.get(userSessionKey);

    if (oldSessionId) {
      // 2️⃣ Delete old session
      await redis.del(`session:${oldSessionId}`);
    }

    // 3️⃣ Save new session mapping (user → sessionId)
    await redis.set(userSessionKey, sessionId, "EX", 60 * 60 * 24); // 24h

    // 4️⃣ Save session data (sessionId → user info)
    await redis.set(
      sessionKey,
      JSON.stringify({
        userId: user._id,
        role: user.role,
      }),
      "EX",
      60 * 60 * 24
    );

    // ==============================
    // 🔑 Generate JWT
    // ==============================

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        sessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // ==============================
    // ✅ Send Response
    // ==============================

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
    console.error("Login Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
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