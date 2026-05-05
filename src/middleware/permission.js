module.exports = (requiredPermissions) => {
  if (!Array.isArray(requiredPermissions)) {
    requiredPermissions = [requiredPermissions];
  }

  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        });
      }

      // Admins have all permissions
      if (req.user.role === "admin") {
        return next();
      }

      // Check if employee has any of the required permissions
      if (req.user.role === "employee") {
        // 'dashboard' is always allowed if they are an employee
        if (requiredPermissions.includes("dashboard")) {
          return next();
        }

        const hasPermission = requiredPermissions.some(perm => 
          req.user.permissions && req.user.permissions.includes(perm)
        );

        if (hasPermission) {
          return next();
        }
      }

      return res.status(403).json({
        message: "Access denied. You don't have the required permission.",
      });
    } catch (err) {
      console.error("Permission middleware error:", err);
      return res.status(500).json({
        message: "Server error",
      });
    }
  };
};
