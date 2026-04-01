const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");

const questionCtrl = require("../controllers/admin/questionController");
const examCtrl = require("../controllers/admin/examController");
const monitorCtrl = require("../controllers/admin/monitoringController");
const referralCtrl = require("../controllers/admin/referralController");
const userCtrl = require("../controllers/admin/userController");

// Question Routes
router.post("/questions", auth, role("admin"), questionCtrl.createQuestion);
router.post("/questions/bulk", auth, role("admin"), questionCtrl.bulkUploadQuestions);
router.get("/questions/summary", auth, role("admin"), questionCtrl.getQuestionSummary);
router.get("/questions/by-group", auth, role("admin"), questionCtrl.getQuestionsByGroup);
router.get("/questions", auth, role("admin"), questionCtrl.getQuestions);

// Exam Routes
router.post("/exams", auth, role("admin"), examCtrl.createExam);
router.get("/exams", auth, role("admin"), examCtrl.getExams);
router.get("/exams/:examId/attempts", auth, role("admin"), examCtrl.getExamAttempts);
router.get("/exams/attempt-response/:attemptId", auth, role("admin"), examCtrl.getAttemptResponse);
router.patch("/exams/evaluate/:attemptId", auth, role("admin"), examCtrl.evaluateAttempt);
router.patch("/exams/publish-result/:attemptId", auth, role("admin"), examCtrl.publishResult);

// Monitoring
router.get("/suspicious", auth, role("admin"), monitorCtrl.getSuspiciousLogs);
router.post("/force-submit/:attemptId", auth, role("admin"), monitorCtrl.forceSubmit);

//user Count
router.get("/totalUser", auth, role("admin"), examCtrl.getTotalUserNo);

// Referral
router.post("/referrals", auth, role("admin"), referralCtrl.createReferral);
router.get("/referrals", auth, role("admin"), referralCtrl.getReferrals);
router.patch("/referrals/:id/toggle", auth, role("admin"), referralCtrl.toggleReferralStatus);

// User Management
router.get("/users", auth, role("admin"), userCtrl.getUsers);
router.put("/users/:id", auth, role("admin"), userCtrl.updateUser);
router.delete("/users/:id", auth, role("admin"), userCtrl.deleteUser);

module.exports = router;