const examService = require("../services/examService");
const Exam = require("../models/Exam");
const ExamAttempt = require("../models/ExamAttempt");

exports.startExam = async (req, res) => {
  try {
    const result = await examService.handleStartOrResume(
      req.params.examId,
      req.user.id
    );
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.syncAnswers = async (req, res) => {
  console.log(req.body.answers);
  
  try {
    const result = await examService.syncAnswersService(
      req.params.attemptId,
      req.user.id,
      req.body.answers
    );
    res.status(200).json(result);
  } catch (err) {
    console.log("error while syncing", err);
    res.status(400).json({ message: err.message });
  }
};

exports.submitExam = async (req, res) => {
  try {
    const result = await examService.submitExamService(
      req.params.attemptId,
      req.user.id
    );
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllExams = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Optional status filter
    // ?status=upcoming | active | completed
    const { status } = req.query;

    const now = new Date();
    let filter = {};

    if (status === "upcoming") {
      filter.startTime = { $gt: now };
    } else if (status === "active") {
      filter.startTime = { $lte: now };
      filter.endTime = { $gte: now };
    } else if (status === "completed") {
      filter.endTime = { $lt: now };
    }

    // Fetch exams + total count in parallel
    const [exams, total] = await Promise.all([
      Exam.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Exam.countDocuments(filter),
    ]);

    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      exams,
    });
  } catch (err) {
    console.error("Get all exams error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getExamsByUserId = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // 1️⃣ Fetch all exams (lean for performance)
    const exams = await Exam.find().lean();

    // 2️⃣ Fetch all user attempts
    const attempts = await ExamAttempt.find({ userId }).lean();

    // Map attempts by examId for O(1) lookup
    const attemptMap = new Map();
    for (let attempt of attempts) {
      attemptMap.set(attempt.examId.toString(), attempt);
    }

    const liveSession = [];
    const submitted = [];
    const expired = [];
    const upcoming = [];

    for (let exam of exams) {
      const attempt = attemptMap.get(exam._id.toString());

      if (attempt) {
        // 🔹 Attempt exists
        if (attempt.status === "active") {
          liveSession.push({
            ...exam,
            attemptId: attempt._id,
            expiresAt: attempt.expiresAt,
          });
        } else if (attempt.status === "submitted" || attempt.status === "timeout") {
          submitted.push({
            ...exam,
            score: attempt.score,
            submittedAt: attempt.submittedAt,
          });
        }
      } else {
        // 🔹 No attempt exists
        if (now < exam.startTime || now <= new Date(exam.startTime).getTime() + 30 * 60 * 1000) { //min * sec * ms
          upcoming.push(exam);
        } else if (now > new Date(exam.startTime).getTime() + 30 * 60 * 1000) {
          // Missed exam
          expired.push(exam);
        }
      }
    }

    res.json({
      liveSession,
      submitted,
      expired,
      upcoming,
    });

  } catch (err) {
    console.error("getExamsByUserId error:", err);
    res.status(500).json({ message: "Server error" });
  }
};