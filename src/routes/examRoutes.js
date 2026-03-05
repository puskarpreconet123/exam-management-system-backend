const router = require("express").Router();
const { startExam, syncAnswers, submitExam, getAllExams, getExamsByUserId, getResult } = require("../controllers/examController");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const examAccess = require("../middleware/examAccess")
const attemptActive = require("../middleware/attemptActive")
const rateLimiter = require("../middleware/rateLimiter")
const examDeviceGuard = require("../middleware/examDeviceGuard");

router.post( "/start/:examId", auth, role("student"), examAccess, startExam);

router.post( "/sync/:attemptId", auth, role("student"), attemptActive, examDeviceGuard, syncAnswers);

router.post( "/submit/:attemptId", auth, role("student"), attemptActive, examDeviceGuard, submitExam);

router.post( "/report-violation/:attemptId", auth, role("student"), attemptActive, require("../controllers/examController").reportViolation);

router.get("/", getAllExams)
router.get("/results", auth, role("student"), getResult)
router.get("/:userId", auth, role("student"), getExamsByUserId)

module.exports = router;