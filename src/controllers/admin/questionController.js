const mongoose = require("mongoose");
const Question = require("../../models/Question");
const { redis } = require("../../config/redis");

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
      difficulty,
      subject,
      board = "General",
      class: className = "General",
      type = "mcq",
      imageUrl = null,
    } = req.body;

    const rawAnswer = req.body.correctAnswer;

    if (!text || !rawAnswer || !difficulty || !subject) {
      return res.status(400).json({
        message: "All fields (text, correctAnswer, difficulty, subject) are required",
      });
    }

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return res.status(400).json({
        message: "Invalid difficulty. Must be easy, medium, or hard",
      });
    }

    if (!["mcq", "tita"].includes(type)) {
      return res.status(400).json({ message: "Invalid type. Must be mcq or tita" });
    }

    let correctAnswer;

    if (type === "mcq") {
      if (!Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ message: "MCQ requires at least 2 options" });
      }
      correctAnswer = rawAnswer.toUpperCase();
      const optionLabels = options.map(o => o.label);
      if (!optionLabels.includes(correctAnswer)) {
        return res.status(400).json({
          message: "Correct answer must match one of the option labels (A, B, C, D)",
        });
      }
    } else {
      correctAnswer = rawAnswer.trim();
    }

    const question = await Question.create({
      text: text.trim(),
      type,
      options: type === "tita" ? [] : options,
      correctAnswer,
      difficulty,
      subject: subject.trim(),
      board: board.trim(),
      class: className.trim(),
      imageUrl: imageUrl || null,
    });

    // 🔥 Update Redis pool immediately
    await redis.sadd(`questions:${board.trim()}:${className.trim()}:${subject.trim()}:${difficulty}`, question._id.toString());

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
        message: "Invalid payload: 'questions' must be a non-empty array",
      });
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qType = q.type || "mcq";

      if (
        !q.text ||
        !q.correctAnswer ||
        !["easy", "medium", "hard"].includes(q.difficulty) ||
        !q.subject ||
        !["mcq", "tita"].includes(qType)
      ) {
        return res.status(400).json({
          message: `Question #${i + 1} is invalid. Ensure text, correctAnswer, difficulty, subject, and type are present.`,
        });
      }

      if (!q.board) q.board = "General";
      if (!q.class) q.class = "General";
      q.type = qType;

      if (qType === "mcq") {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return res.status(400).json({
            message: `Question #${i + 1}: MCQ requires at least 2 options.`,
          });
        }
        const optionLabels = q.options.map(o => o.label);
        if (!optionLabels.includes(q.correctAnswer)) {
          return res.status(400).json({
            message: `Question #${i + 1}: Correct answer "${q.correctAnswer}" must match one of the option labels: [${optionLabels.join(", ")}]`,
          });
        }
      } else {
        q.options = [];
      }
    }

    const inserted = await Question.insertMany(questions);

    // 🔥 Update Redis in batch
    const grouped = {};

    inserted.forEach(q => {
      const key = `${q.board}:${q.class}:${q.subject}:${q.difficulty}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(q._id.toString());
    });

    for (let key of Object.keys(grouped)) {
      if (grouped[key].length > 0) {
        await redis.sadd(`questions:${key}`, ...grouped[key]);
      }
    }

    res.json({
      message: "Questions uploaded successfully",
      count: inserted.length,
    });

  } catch (err) {
    console.error("BulkUpload Error:", err.message);
    res.status(500).json({
      message: "Bulk upload failed",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET QUESTIONS (Paginated - kept for backward compat)
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

/*
|--------------------------------------------------------------------------
| GET QUESTION SUMMARY (Aggregated - Subject > Difficulty > Count)
|--------------------------------------------------------------------------
*/
exports.getQuestionSummary = async (req, res) => {
  try {
    const { board = "General", class: className = "General" } = req.query;
    
    const summary = await Question.aggregate([
      { $match: { board, class: className } },
      {
        $group: {
          _id: { subject: "$subject", difficulty: "$difficulty" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.subject",
          difficulties: {
            $push: {
              difficulty: "$_id.difficulty",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // reshape to { subject, total, difficulties: [{ difficulty, count }] }
    const result = summary.map(s => ({
      subject: s._id,
      total: s.total,
      difficulties: s.difficulties.sort((a, b) => {
        const order = ['easy', 'medium', 'hard'];
        return order.indexOf(a.difficulty) - order.indexOf(b.difficulty);
      }),
    }));

    const totalRecords = result.reduce((sum, s) => sum + s.total, 0);

    res.json({ data: result, totalRecords });
  } catch (err) {
    console.error("getQuestionSummary Error:", err);
    res.status(500).json({ message: "Failed to fetch question summary" });
  }
};

/*
|--------------------------------------------------------------------------
| GET QUESTIONS BY GROUP (Lazy-Load for a specific subject + difficulty)
|--------------------------------------------------------------------------
*/
exports.getQuestionsByGroup = async (req, res) => {
  try {
    const { subject, difficulty, board = "General", class: className = "General" } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    if (!subject || !difficulty) {
      return res.status(400).json({ message: "subject and difficulty are required" });
    }

    const query = { subject, difficulty, board, class: className };
    const total = await Question.countDocuments(query);
    const questions = await Question.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      data: questions,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
    });
  } catch (err) {
    console.error("getQuestionsByGroup Error:", err);
    res.status(500).json({ message: "Failed to fetch questions for group" });
  }
};