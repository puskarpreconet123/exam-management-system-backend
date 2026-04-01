const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { redis } = require("../config/redis"); // adjust path

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token)
      return res.status(401).json({ message: "No token provided" });

    // 🔐 Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔎 Check user exists
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(401).json({ message: "User not found" });

    // ===============================
    // 🔥 CRITICAL: Check Redis Session
    // ===============================

    const storedSessionId = await redis.get(
      `user_session:${user._id}`
    );

    if (!storedSessionId || storedSessionId !== decoded.sessionId) {
      return res.status(401).json({
        message: "Session expired. Logged in from another device.",
      });
    }

    // ===============================

    req.user = {
      id: user._id.toString(),
      role: user.role,
      sessionId: decoded.sessionId,
      paymentStatus: user.paymentStatus,
    };

    next();

  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};