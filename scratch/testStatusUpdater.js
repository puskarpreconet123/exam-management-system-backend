require("dotenv").config();
const connectDB = require("../src/config/db");
const Exam = require("../src/models/Exam");
const { calculateExamStatus } = require("../src/utils/examStatusUpdater");

const runTest = async () => {
  await connectDB();
  console.log("Database connected.");

  const now = new Date();
  
  // Test range exam
  const rangeExamFuture = {
    schedulingType: "range",
    startTime: new Date(now.getTime() + 1000 * 60 * 10), // +10 mins
    endTime: new Date(now.getTime() + 1000 * 60 * 20), // +20 mins
  };
  const rangeExamActive = {
    schedulingType: "range",
    startTime: new Date(now.getTime() - 1000 * 60 * 5), // -5 mins
    endTime: new Date(now.getTime() + 1000 * 60 * 10), // +10 mins
  };
  const rangeExamPast = {
    schedulingType: "range",
    startTime: new Date(now.getTime() - 1000 * 60 * 20), // -20 mins
    endTime: new Date(now.getTime() - 1000 * 60 * 10), // -10 mins
  };

  console.log("Range Exam Future Status:", calculateExamStatus(rangeExamFuture, now)); // expected: scheduled
  console.log("Range Exam Active Status:", calculateExamStatus(rangeExamActive, now)); // expected: active
  console.log("Range Exam Past Status:", calculateExamStatus(rangeExamPast, now)); // expected: completed

  // Test fixed exam
  const fixedExamFuture = {
    schedulingType: "fixed",
    startTime: new Date(now.getTime() + 1000 * 60 * 10), // +10 mins
  };
  const fixedExamActive = {
    schedulingType: "fixed",
    startTime: new Date(now.getTime() - 1000 * 60 * 10), // -10 mins (within 30 mins grace window)
  };
  const fixedExamPast = {
    schedulingType: "fixed",
    startTime: new Date(now.getTime() - 1000 * 60 * 40), // -40 mins (past 30 mins grace window)
  };

  console.log("Fixed Exam Future Status:", calculateExamStatus(fixedExamFuture, now)); // expected: scheduled
  console.log("Fixed Exam Active Status:", calculateExamStatus(fixedExamActive, now)); // expected: active
  console.log("Fixed Exam Past Status:", calculateExamStatus(fixedExamPast, now)); // expected: completed

  // Print all current non-draft exams and their statuses
  const exams = await Exam.find({});
  console.log("\nCurrently in DB:");
  for (let exam of exams) {
    console.log(`- Exam: "${exam.title}" | Type: ${exam.schedulingType} | Current Status in DB: ${exam.status} | Calculated Correct Status: ${calculateExamStatus(exam, now)}`);
  }

  process.exit(0);
};

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
