const User = require("../../models/User");
const ExamAttempt = require("../../models/ExamAttempt");
const notificationService = require("../../services/notificationService");
const actionLogService = require("../../services/actionLogService");

// @desc    Get all users with pagination and search
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const board = req.query.board;
    const className = req.query.class;
    const referralCode = req.query.referralCode;

    const skip = (page - 1) * limit;

    const query = { role: "student" };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { "studentDetails.studentContact": { $regex: search, $options: "i" } }
      ];
    }

    if (board && board !== "All") {
      query["studentDetails.board"] = board;
    }
    if (className && className !== "All") {
      query["studentDetails.className"] = className;
    }
    if (referralCode && referralCode !== "All") {
      query["usedReferralCode"] = referralCode;
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update user details
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, paymentStatus, studentDetails, guardianDetails, address } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();
    if (paymentStatus) user.paymentStatus = paymentStatus;

    // Role updates are restricted to specialized controllers if needed

    // Update nested objects safely
    if (studentDetails) {
      user.studentDetails = { ...user.studentDetails, ...studentDetails };
    }
    if (guardianDetails) {
      user.guardianDetails = { ...user.guardianDetails, ...guardianDetails };
    }
    if (address) {
      user.address = { ...user.address, ...address };
    }

    await user.save();

    res.status(200).json({
      message: "User updated successfully",
      user: await User.findById(id).select("-password")
    });

    if (id === req.user.id) {
      // If admin is updating themselves, only send one notification
      await notificationService.notifyUser(
        id,
        "Profile Updated",
        "Your account details have been updated successfully.",
        "success"
      );
    } else {
      // Notify the target User
      await notificationService.notifyUser(
        id,
        "Account Updated",
        "Your account details have been updated by an administrator.",
        "info"
      );

      // Notify Admin
      await notificationService.notifyUser(
        req.user.id,
        "User Updated",
        `User ${user.name} (${user.email}) has been updated.`,
        "info"
      );
    }

    // 🔒 Log Action
    await actionLogService.logAction(
      req,
      "UPDATE_USER",
      id,
      "User",
      { name: user.name, email: user.email, role: user.role }
    );
  } catch (error) {
    console.error("Error updating user:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email or Contact Number already in use by another account" });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete user and their attempts
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Optional: Delete associated exam attempts to prevent orphaned records
    await ExamAttempt.deleteMany({ userId: id });

    await User.findByIdAndDelete(id);

    res.status(200).json({ message: "User and associated attempts deleted successfully" });

    // ✨ Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "User Deleted",
      `User ${user.name} (${user.email}) has been deleted along with their attempts.`,
      "warning"
    );

    // 🔒 Log Action
    await actionLogService.logAction(
      req,
      "DELETE_USER",
      id,
      "User",
      { name: user.name, email: user.email, role: user.role }
    );
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
