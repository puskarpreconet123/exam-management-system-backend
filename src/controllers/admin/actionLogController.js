const ActionLog = require("../../models/ActionLog");

/**
 * @desc    Get all action logs (Admin only)
 * @route   GET /api/admin/action-logs
 * @access  Private/Admin
 */
exports.getActionLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { employeeId, action, userId, startDate, endDate } = req.query;

    const query = {};

    if (employeeId) {
      query.employeeId = { $regex: employeeId, $options: "i" };
    }
    if (action) {
      query.action = action;
    }
    if (userId) {
      query.userId = userId;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await ActionLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await ActionLog.countDocuments(query);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching action logs:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
