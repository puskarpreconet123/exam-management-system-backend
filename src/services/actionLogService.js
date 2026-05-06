const ActionLog = require("../models/ActionLog");

/**
 * Log an administrative action
 * @param {Object} req - Express request object (to extract user context)
 * @param {String} action - Action performed (e.g., "CREATE_EXAM")
 * @param {String} targetId - ID of the target resource
 * @param {String} targetModel - Model name of the target resource
 * @param {Object} details - Additional metadata about the action
 */
exports.logAction = async (req, action, targetId = null, targetModel = null, details = {}) => {
  try {
    if (!req.user) {
      console.warn("Attempted to log action without authenticated user context");
      return;
    }

    const logData = {
      userId: req.user.id,
      employeeId: req.user.employeeId || null,
      userName: req.user.name || "Unknown",
      performedByRole: req.user.role,
      action,
      targetId,
      targetModel,
      details,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"]
    };

    await ActionLog.create(logData);
  } catch (error) {
    console.error("Failed to create action log:", error);
  }
};
