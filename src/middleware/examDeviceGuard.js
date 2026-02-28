const mongoose = require("mongoose");
const { redis } = require("../config/redis");
const suspiciousService = require("../services/sucpiciousService");

module.exports = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user?.id;
    const sessionId = req.user?.sessionId;
    const  examId  = req.attempt.examId
    

    // 1️⃣ Validate attemptId
    if (!mongoose.Types.ObjectId.isValid(attemptId)) { 
      return res.status(400).json({
        message: "Invalid attempt ID",
      });
    }

    if (!sessionId) {
      return res.status(401).json({
        message: "Invalid session",
      });
    }

    const redisKey = `exam_device:${attemptId}`;

    // 2️⃣ Try atomic set if not exists (first device lock)
    const isFirstDevice = await redis.set(
      redisKey,
      sessionId,
      "NX",           // Only set if not exists
      "EX",
      60 * 60 * 3     // 3 hour TTL (adjust to exam duration)
    );

    if (isFirstDevice) {
      return next(); // First device registered
    }

    // 3️⃣ Already locked → compare session
    const storedSession = await redis.get(redisKey);
    
    if (storedSession !== sessionId) {
      await redis.set(
      redisKey,
      sessionId,
      "XX",       //  set if new value to existed sessioId
      "EX",
      60 * 60 * 3     // 3 hour TTL (adjust to exam duration)
    );
      await suspiciousService.logSuspiciousActivity({
        userId,
        examId,
        attemptId,
        type: "DEVICE_SWITCH",
        metadata: {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      console.log("Device or browser change detected");
      return next();
    }

    next();

  } catch (err) {
    console.error("examDeviceGuard error:", err);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};