require("dotenv").config();
const mongoose = require("mongoose");
const ActionLog = require("./src/models/ActionLog");
const actionLogService = require("./src/services/actionLogService");

const testLogging = async () => {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.");

    const mockReq = {
      user: {
        id: new mongoose.Types.ObjectId(),
        name: "Test Admin",
        employeeId: "EMP-TEST",
        role: "admin"
      },
      ip: "127.0.0.1",
      headers: {
        "user-agent": "TestAgent"
      }
    };

    console.log("Logging test action...");
    await actionLogService.logAction(mockReq, "TEST_ACTION", "test-id", "TestModel", { foo: "bar" });
    
    const logs = await ActionLog.find({ action: "TEST_ACTION" });
    console.log(`Found ${logs.length} logs.`);
    console.log("Latest log:", logs[0]);

    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
};

testLogging();
