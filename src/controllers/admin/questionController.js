const mongoose = require("mongoose");
const Question = require("../../models/Question");
const redis = require("../../config/redis");

/*
|--------------------------------------------------------------------------
| CREATE SINGLE QUESTION
|--------------------------------------------------------------------------
*/
exports.createQuestion = async (req, res) => {
  try {
    const {
      text,
      options,
      correctAnswer,
      difficulty,
      subject,
    } = req.body;

    // Basic validation
    if (
      !text ||
      !Array.isArray(options) ||
      options.length < 2 ||
      !correctAnswer ||
      !difficulty ||
      !subject
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return res.status(400).json({
        message: "Invalid difficulty",
      });
    }

    // Validate options format
    const optionValues = options.map(o => o.value);

    if (!optionValues.includes(correctAnswer)) {
      return res.status(400).json({
        message: "Correct answer must match one of the option values",
      });
    }

    const question = await Question.create({
      text: text.trim(),
      options,
      correctAnswer,
      difficulty,
      subject: subject.trim(),
    });

    // 🔥 Update Redis pool immediately
    await redis.sadd(`questions:${difficulty}`, question._id.toString());

    res.status(201).json({
      message: "Question created successfully",
      question,
    });

  } catch (err) {
    console.error("CreateQuestion Error:", err);
    res.status(500).json({
      message: "Failed to create question",
    });
  }
};

/*
|--------------------------------------------------------------------------
| BULK UPLOAD QUESTIONS
|--------------------------------------------------------------------------
*/
exports.bulkUploadQuestions = async (req, res) => {
  try {
    const questions = req.body.questions;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        message: "Invalid payload",
      });
    }

    for (const q of questions) {
      if (
        !q.text ||
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        !q.correctAnswer ||
        !["easy", "medium", "hard"].includes(q.difficulty) ||
        !q.subject
      ) {
        return res.status(400).json({
          message: "One or more questions are invalid",
        });
      }

      const optionValues = q.options.map(o => o.value);

      if (!optionValues.includes(q.correctAnswer)) {
        return res.status(400).json({
          message: "Correct answer must exist in options",
        });
      }
    }

    const inserted = await Question.insertMany(questions);

    // 🔥 Update Redis in batch
    const grouped = {
      easy: [],
      medium: [],
      hard: [],
    };

    inserted.forEach(q => {
      grouped[q.difficulty].push(q._id.toString());
    });

    for (let level of ["easy", "medium", "hard"]) {
      if (grouped[level].length > 0) {
        await redis.sadd(`questions:${level}`, ...grouped[level]);
      }
    }

    res.json({
      message: "Questions uploaded successfully",
      count: inserted.length,
    });

  } catch (err) {
    console.error("BulkUpload Error:", err);
    res.status(500).json({
      message: "Bulk upload failed",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET QUESTIONS (Paginated)
|--------------------------------------------------------------------------
*/
exports.getQuestions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;

    const questions = await Question.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Question.countDocuments();

    res.json({
      data: questions,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
    });

  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch questions",
    });
  }
};