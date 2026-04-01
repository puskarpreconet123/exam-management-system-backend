const User = require("../../models/User");
const ExamAttempt = require("../../models/ExamAttempt");

// @desc    Get all users with pagination and search
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    const query = { role: "student" };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { "studentDetails.studentContact": { $regex: search, $options: "i" } }
      ];
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
    const { name, email, role, paymentStatus, studentDetails, guardianDetails, address } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();
    if (role) user.role = role;
    if (paymentStatus) user.paymentStatus = paymentStatus;

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
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
