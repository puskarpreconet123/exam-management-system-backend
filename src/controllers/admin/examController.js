const mongoose = require("mongoose");
const Exam = require("../../models/Exam");
const ExamAttempt = require("../../models/ExamAttempt");

/*
|--------------------------------------------------------------------------
| CREATE EXAM
|--------------------------------------------------------------------------
*/
exports.createExam = async (req, res) => {
  try {
    const {
      title,
      totalQuestions,
      difficultyDistribution,
      durationMinutes,
      startTime,
    } = req.body;

    // Basic validation
    if (
      !title ||
      !totalQuestions ||
      !difficultyDistribution ||
      !durationMinutes ||
      !startTime
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const { easy, medium, hard } = difficultyDistribution;

    if (
      easy == null ||
      medium == null ||
      hard == null
    ) {
      return res.status(400).json({
        message: "Invalid difficulty distribution",
      });
    }

    if (easy + medium + hard !== 100) {
      return res.status(400).json({
        message: "Difficulty distribution must equal 100",
      });
    }

    const parsedStart = new Date(startTime);

    if (isNaN(parsedStart.getTime())) {
      return res.status(400).json({
        message: "Invalid startTime format",
      });
    }

    const exam = await Exam.create({
      title: title.trim(),
      totalQuestions,
      distribution: difficultyDistribution,
      duration: durationMinutes,
      startTime: parsedStart,
    });

    res.status(201).json({
      message: "Exam created successfully",
      exam,
    });

  } catch (err) {
    console.error("CreateExam Error:", err);
    res.status(500).json({
      message: "Failed to create exam",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL EXAMS (Paginated)
|--------------------------------------------------------------------------
*/
exports.getExams = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;

    const exams = await Exam.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Exam.countDocuments();

    res.json({
      data: exams,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
    });

  } catch (err) {
    console.error("GetExams Error:", err);
    res.status(500).json({ message: "Failed to fetch exams" });
  }
};

/*
|--------------------------------------------------------------------------
| GET ATTEMPTS FOR A SPECIFIC EXAM (Paginated)
|--------------------------------------------------------------------------
*/
exports.getExamAttempts = async (req, res) => {
  try {
    const { examId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        message: "Invalid exam ID",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 50;

    const attempts = await ExamAttempt.find({ examId })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await ExamAttempt.countDocuments({ examId });

    res.json({
      data: attempts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
    });

  } catch (err) {
    console.error("GetExamAttempts Error:", err);
    res.status(500).json({
      message: "Failed to fetch attempts",
    });
  }
};