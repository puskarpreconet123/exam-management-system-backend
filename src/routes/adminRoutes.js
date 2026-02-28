const router = require("express").Router();
const auth = require("../middleware/auth");
const role = require("../middleware/role");

const questionCtrl = require("../controllers/admin/questionController");
const examCtrl = require("../controllers/admin/examController");
const monitorCtrl = require("../controllers/admin/monitoringController");

// Question Routes
router.post("/questions", auth, role("admin"), questionCtrl.createQuestion);
router.post("/questions/bulk", auth, role("admin"), questionCtrl.bulkUploadQuestions);
router.get("/questions", auth, role("admin"), questionCtrl.getQuestions);

// Exam Routes
router.post("/exams", auth, role("admin"), examCtrl.createExam);
router.get("/exams", auth, role("admin"), examCtrl.getExams);
router.get("/exams/:examId/attempts", auth, role("admin"), examCtrl.getExamAttempts);

// Monitoring
router.get("/suspicious", auth, role("admin"), monitorCtrl.getSuspiciousLogs);
router.post("/force-submit/:attemptId", auth, role("admin"), monitorCtrl.forceSubmit);

module.exports = router;