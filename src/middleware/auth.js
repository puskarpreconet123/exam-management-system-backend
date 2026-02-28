const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.split(" ")[1];

    if (!token)
      return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user)
      return res.status(401).json({ message: "User not found" });

    req.user = {
    id: user._id.toString(),
    role: user.role,
    sessionId: decoded.sessionId,
  };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};