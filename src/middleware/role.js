module.exports = (allowedRoles = []) => {
  // allow single string also
  if (!Array.isArray(allowedRoles)) {
    allowedRoles = [allowedRoles];
  }

  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          message: "Access denied",
        });
      }

      next();
    } catch (err) {
      console.error("Role middleware error:", err);
      return res.status(500).json({
        message: "Server error",
      });
    }
  };
};