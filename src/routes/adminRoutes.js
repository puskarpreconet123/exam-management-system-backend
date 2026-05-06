const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const permission = require("../middleware/permission");

const questionCtrl = require("../controllers/admin/questionController");
const examCtrl = require("../controllers/admin/examController");
const monitorCtrl = require("../controllers/admin/monitoringController");
const referralCtrl = require("../controllers/admin/referralController");
const userCtrl = require("../controllers/admin/userController");
const employeeCtrl = require("../controllers/admin/employeeController");
const uploadCtrl = require("../controllers/admin/uploadController");
const actionLogCtrl = require("../controllers/admin/actionLogController");
const settingCtrl = require("../controllers/admin/settingController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Settings (Strictly Admin)
router.get("/settings", auth, role("admin"), settingCtrl.getSettings);
router.patch("/settings", auth, role("admin"), settingCtrl.updateSettings);

// Image Upload (Admins only for now or based on need)
router.post("/upload", auth, role("admin"), upload.single("image"), uploadCtrl.uploadImage);

// Question Routes
router.post("/questions", auth, permission("questions"), questionCtrl.createQuestion);
router.post("/questions/bulk", auth, permission("questions"), questionCtrl.bulkUploadQuestions);
router.get("/questions/summary", auth, permission("questions"), questionCtrl.getQuestionSummary);
router.get("/questions/by-group", auth, permission("questions"), questionCtrl.getQuestionsByGroup);
router.get("/questions", auth, permission("questions"), questionCtrl.getQuestions);
router.patch("/questions/:id", auth, permission("questions"), questionCtrl.updateQuestion);
router.delete("/questions/:id", auth, permission("questions"), questionCtrl.deleteQuestion);

// Exam Routes
router.post("/exams", auth, permission("exams"), examCtrl.createExam);
router.get("/exams/simple", auth, permission(["exams", "evaluation", "monitoring"]), examCtrl.getSimpleExamsList);
router.get("/exams", auth, permission(["exams", "evaluation", "monitoring"]), examCtrl.getExams);
router.patch("/exams/:id", auth, permission("exams"), examCtrl.updateExam);
router.delete("/exams/:id", auth, permission("exams"), examCtrl.deleteExam);
router.get("/exams/:examId/attempts", auth, permission("evaluation"), examCtrl.getExamAttempts);
router.get("/exams/attempt-response/:attemptId", auth, permission("evaluation"), examCtrl.getAttemptResponse);
router.patch("/exams/evaluate/:attemptId", auth, permission("evaluation"), examCtrl.evaluateAttempt);
router.patch("/exams/:examId/evaluate-all", auth, permission("evaluation"), examCtrl.evaluateAllAttempts);
router.patch("/exams/update-score/:attemptId", auth, permission("evaluation"), examCtrl.updateScore);
router.patch("/exams/override-answers/:attemptId", auth, permission("evaluation"), examCtrl.overrideAnswers);
router.patch("/exams/publish-result/:attemptId", auth, permission("evaluation"), examCtrl.publishResult);
router.patch("/exams/:examId/publish-all", auth, permission("evaluation"), examCtrl.publishAllResults);

// Monitoring
router.get("/suspicious", auth, permission("monitoring"), monitorCtrl.getSuspiciousLogs);
router.post("/force-submit/:attemptId", auth, permission("monitoring"), monitorCtrl.forceSubmit);
router.post("/force-submit-bulk", auth, permission("monitoring"), monitorCtrl.forceSubmitBulk);
router.post("/suspicious/dismiss-bulk", auth, permission("monitoring"), monitorCtrl.dismissSuspiciousBulk);

// Dashboard Stats
router.get("/dashboard/stats", auth, permission("dashboard"), examCtrl.getDashboardStats);

//user Count
router.get("/totalUser", auth, permission("dashboard"), examCtrl.getTotalUserNo);

// Referral
router.post("/referrals", auth, permission("referrals"), referralCtrl.createReferral);
router.get("/referrals", auth, permission("referrals"), referralCtrl.getReferrals);
router.patch("/referrals/:id/toggle", auth, permission("referrals"), referralCtrl.toggleReferralStatus);
router.delete("/referrals/:id", auth, permission("referrals"), referralCtrl.deleteReferral);

// User Management (Students)
router.get("/users", auth, permission("students"), userCtrl.getUsers);
router.put("/users/:id", auth, permission("students"), userCtrl.updateUser);
router.delete("/users/:id", auth, permission("students"), userCtrl.deleteUser);

// Employee Management (Strictly Admin)
router.get("/employees", auth, role("admin"), employeeCtrl.getEmployees);
router.post("/employees", auth, role("admin"), employeeCtrl.createEmployee);
router.patch("/employees/:id", auth, role("admin"), employeeCtrl.updateEmployee);
router.delete("/employees/:id", auth, role("admin"), employeeCtrl.deleteEmployee);

// Activity Logs (Strictly Admin)
router.get("/action-logs", auth, role("admin"), actionLogCtrl.getActionLogs);

module.exports = router;