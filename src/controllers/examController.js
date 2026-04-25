const examService = require("../services/examService");
const Exam = require("../models/Exam");
const User = require("../models/User");
const ExamAttempt = require("../models/ExamAttempt");
const ExamResponse = require("../models/ExamResponse");
const Question = require("../models/Question");
const suspiciousService = require("../services/sucpiciousService");

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
    // Synchronously mark as submitted to prevent frontend redirect race conditions
    const attempt = await ExamAttempt.findOneAndUpdate(
      { _id: req.params.attemptId, status: "active", userId: req.user.id },
      { $set: { status: "submitted", submittedAt: new Date() } }
    );

    if (!attempt) {
      return res.status(200).json({ message: "Exam already submitted." });
    }

    const { examQueue } = require("../queues/examQueue");
    
    // Add to background queue to handle heavy scoring logic
    await examQueue.add("manual-submit", {
      attemptId: req.params.attemptId,
      userId: req.user.id,
      source: "manual"
    }, { jobId: `submit_${req.params.attemptId}` });

    res.status(200).json({ message: "Exam submitted successfully. Your result is pending review." });
  } catch (err) {
    require('fs').appendFileSync('error.log', new Date().toISOString() + ' submitExam error: ' + err.stack + '\n');
    res.status(400).json({ message: err.message });
  }
};

exports.reportViolation = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { type, metadata } = req.body;
    const userId = req.user.id;

    const attempt = await ExamAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });

    await suspiciousService.logSuspiciousActivity({
      userId,
      examId: attempt.examId,
      attemptId,
      type,
      metadata
    });

    res.status(200).json({ message: "Violation reported" });
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

    const user = await User.findById(userId).select("createdAt studentDetails").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    const userCreatedAt = user.createdAt || new Date(0);
    
    const board = user.studentDetails?.board || "General";
    const className = user.studentDetails?.className || "General";

    // 1️⃣ Fetch all exams (filtered by matching board and class, plus all demo exams)
    const exams = await Exam.find({
      $or: [
        { board, class: className },
        { title: { $regex: /^demo exam/i } }
      ]
    }).lean();

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
            score: attempt.isPublished ? attempt.score : null,
            submittedAt: attempt.submittedAt,
            isPublished: attempt.isPublished
          });
        }
      } else {
        // 🔹 No attempt exists — categorise by scheduling type
        if (exam.schedulingType === "range") {
          // Range exam: available between startTime and endTime
          if (now < exam.startTime) {
            upcoming.push(exam); // Not started yet
          } else if (exam.endTime && now <= exam.endTime) {
            upcoming.push(exam); // Within the active window — joinable
          } else {
            if (userCreatedAt <= exam.startTime) {
              expired.push(exam); // Past the end time
            }
          }
        } else {
          // Fixed exam: 30-min join window from startTime
          if (now < exam.startTime || now <= new Date(exam.startTime).getTime() + 30 * 60 * 1000) {
            upcoming.push(exam);
          } else {
            if (userCreatedAt <= exam.startTime) {
              expired.push(exam); // Missed exam
            }
          }
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

exports.getResult = async (req, res) => {
  try {
    const userId = req.user.id;

    const publishedAttempts = await ExamAttempt
      .find({ userId, isPublished: true })
      .populate("examId").lean()

    res.status(200).json({
      publishedAttempts
    });

  } catch (error) {
    console.log("Error while fetching result of the user:", error.message);

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getDetailedResult = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.id;

    const attempt = await ExamAttempt.findOne({ _id: attemptId, userId }).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found." });
    if (!attempt.isPublished) return res.status(403).json({ message: "Results for this exam are not published yet" });

    const exam = await Exam.findById(attempt.examId).lean();
    
    const responseDoc = await ExamResponse.findOne({ attemptId }).lean();
    if (!responseDoc) return res.status(404).json({ message: "Response data not found" });

    const questions = await Question.find({ _id: { $in: responseDoc.questionIds } }).lean();

    const answersMap = {};
    const overrideMap = {};
    for (let ans of responseDoc.answers) {
      answersMap[ans.questionId.toString()] = ans.selectedOption;
      if (ans.isCorrectOverride !== null && ans.isCorrectOverride !== undefined) {
        overrideMap[ans.questionId.toString()] = ans.isCorrectOverride;
      }
    }

    const detailedQuestions = responseDoc.questionIds.map(qid => {
      const q = questions.find(question => question._id.toString() === qid.toString());
      if (!q) return null;

      const qIdStr = q._id.toString();
      const userAnswer = answersMap[qIdStr] || null;
      const isOverridden = qIdStr in overrideMap;

      let autoCorrect;
      if (q.options && q.options.length > 0) {
        const raw = String(userAnswer || '');
        const optByLabel = q.options.find(o => o.label === raw);
        const optByValue = q.options.find(o => o.value === raw);
        const optById = q.options.find(o => o._id?.toString() === raw);
        const resolvedLabel = optByLabel?.label || optByValue?.label || optById?.label || raw;
        autoCorrect = q.correctAnswer === resolvedLabel;
      } else {
        autoCorrect = userAnswer === q.correctAnswer;
      }

      return {
        _id: q._id,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        userAnswer,
        isCorrect: isOverridden ? overrideMap[qIdStr] : autoCorrect,
        isOverridden,
      };
    }).filter(Boolean);

    res.json({
      exam: {
         title: exam.title,
         totalQuestions: exam.totalQuestions,
         duration: exam.duration
      },
      attempt: {
         score: attempt.score,
         submittedAt: attempt.submittedAt,
         percentage: Math.round((attempt.score / exam.totalQuestions) * 100)
      },
      questions: detailedQuestions
    });

  } catch (err) {
    console.error("Get detailed result error:", err);
    res.status(500).json({ message: "Server error" });
  }
};