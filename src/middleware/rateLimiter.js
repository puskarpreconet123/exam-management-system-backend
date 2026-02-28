const { redis } = require("../config/redis");

module.exports = async (req, res, next) => {
  try {
    const key = `rate:${req.user.id}`;

    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 5); // 5 sec window
    }
    
    if (count > 20) {
      await suspiciousService.logSuspiciousActivity({
        userId: req.user.id,
        examId,
        type: "RATE_LIMIT_EXCEEDED",
        metadata: {
          route: req.originalUrl,
        },
      });
      console.log("to many req");
      
      return res.status(429).json({
        message: "Too many requests",
      });
    }

    next();
  } catch (err) {
    next();
  }
};