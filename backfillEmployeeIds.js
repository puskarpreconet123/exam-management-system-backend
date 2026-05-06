require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");

const backfillEmployeeIds = async () => {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const employees = await User.find({ role: "employee", employeeId: { $exists: false } });
    console.log(`Found ${employees.length} employees without IDs.`);

    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      const count = await User.countDocuments({ role: "employee", employeeId: { $exists: true } });
      const random = Math.floor(1000 + Math.random() * 9000);
      employee.employeeId = `EMP-${count + 1}${random}`;
      await employee.save();
      console.log(`Assigned ID ${employee.employeeId} to ${employee.name}`);
    }

    console.log("Backfill complete.");
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
};

backfillEmployeeIds();
