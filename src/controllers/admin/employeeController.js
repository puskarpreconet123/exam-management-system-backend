const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const notificationService = require("../../services/notificationService");
const actionLogService = require("../../services/actionLogService");

// @desc    Get all employees
exports.getEmployees = async (req, res) => {
  try {
    const employees = await User.find({ role: "employee" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      employees,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Create a new employee
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "employee",
      permissions: permissions || [],
      emailVerified: true, // Internal creation
      phoneVerified: true,
    });

    res.status(201).json({
      message: "Employee created successfully",
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        permissions: employee.permissions,
      },
    });

    // Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Employee Created",
      `Employee ${name} has been added to the system.`,
      "success"
    );

    // Log Action
    await actionLogService.logAction(
      req,
      "CREATE_EMPLOYEE",
      employee._id.toString(),
      "User",
      { name: employee.name, email: employee.email }
    );
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update employee
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, permissions, password } = req.body;

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (name) employee.name = name;
    if (email) employee.email = email.toLowerCase().trim();
    if (permissions) employee.permissions = permissions;
    
    // role: "employee" is already set on creation and we don't allow changing it here
    
    if (password) {
      employee.password = await bcrypt.hash(password, 10);
    }

    await employee.save();

    res.status(200).json({
      message: "Employee updated successfully",
      employee: await User.findById(id).select("-password"),
    });

    // Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Employee Updated",
      `Details for employee ${employee.name} have been updated.`,
      "info"
    );

    // Log Action
    await actionLogService.logAction(
      req,
      "UPDATE_EMPLOYEE",
      id,
      "User",
      { name: employee.name, email: employee.email }
    );
  } catch (error) {
    console.error("Error updating employee:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({ message: "Employee deleted successfully" });

    // Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Employee Deleted",
      `Employee ${employee.name} has been removed from the system.`,
      "warning"
    );

    // Log Action
    await actionLogService.logAction(
      req,
      "DELETE_EMPLOYEE",
      id,
      "User",
      { name: employee.name, email: employee.email }
    );
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
