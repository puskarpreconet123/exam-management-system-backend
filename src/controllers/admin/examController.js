const mongoose = require("mongoose");
const Exam = require("../../models/Exam");
const ExamAttempt = require("../../models/ExamAttempt");
const User = require("../../models/User");
const { redis } = require("../../config/redis");
const ExamResponse = require("../../models/ExamResponse");
const Question = require("../../models/Question");
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
      schedulingType = "fixed",
      endTime,
      subjects,
      board = "General",
      class: className = "General",
    } = req.body;

    // Basic validation
    if (
      !title ||
      !totalQuestions ||
      !difficultyDistribution ||
      !durationMinutes ||
      !startTime ||
      !Array.isArray(subjects) ||
      subjects.length === 0
    ) {
      return res.status(400).json({
        message: "All fields including subjects are required",
      });
    }

    const computedTotal = subjects.reduce((sum, s) => sum + Number(s.count || 0), 0);
    if (computedTotal !== Number(totalQuestions)) {
      return res.status(400).json({
        message: `Total questions (${totalQuestions}) does not match the sum of subject questions (${computedTotal})`,
      });
    }

    if (!['fixed', 'range'].includes(schedulingType)) {
      return res.status(400).json({
        message: "schedulingType must be 'fixed' or 'range'",
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

    // Range-specific validation
    let parsedEnd = null;
    if (schedulingType === "range") {
      if (!endTime) {
        return res.status(400).json({
          message: "endTime is required for range-type exams",
        });
      }
      parsedEnd = new Date(endTime);
      if (isNaN(parsedEnd.getTime())) {
        return res.status(400).json({ message: "Invalid endTime format" });
      }
      if (parsedEnd <= parsedStart) {
        return res.status(400).json({
          message: "endTime must be after startTime",
        });
      }
    }

    const exam = await Exam.create({
      title: title.trim(),
      totalQuestions,
      subjects,
      distribution: difficultyDistribution,
      duration: durationMinutes,
      startTime: parsedStart,
      schedulingType,
      endTime: parsedEnd,
      board: board.trim(),
      class: className.trim(),
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
    const limit = 30;

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

/*
|--------------------------------------------------------------------------
| PUBLISH RESULT
|--------------------------------------------------------------------------
*/
exports.publishResult = async (req, res) => {
  try {
    const { attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt ID" });
    }

    const attempt = await ExamAttempt.findByIdAndUpdate(
      attemptId,
      { isPublished: true },
      { new: true }
    );

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    res.json({
      message: "Result published successfully",
      attempt,
    });
  } catch (err) {
    console.error("PublishResult Error:", err);
    res.status(500).json({ message: "Failed to publish result" });
  }
};

/*
|--------------------------------------------------------------------------
| EVALUATE ATTEMPT
|--------------------------------------------------------------------------
*/
exports.evaluateAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt ID" });
    }

    const ExamResponse = require("../../models/ExamResponse");
    const Question = require("../../models/Question");

    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    const response = await ExamResponse.findOne({ attemptId });
    if (!response) {
      return res.status(404).json({ message: "No response found for this attempt" });
    }

    const questionIds = response.answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

    console.log(`Evaluating Attempt ${attemptId}:`, {
      totalQuestions: questions.length,
      answersReceived: response.answers.length
    });

    let score = 0;
    const totalPossible = questions.length;

    response.answers.forEach((answer, idx) => {
      const question = questions.find(q => q._id.toString() === answer.questionId.toString());
      if (question) {
        // Robust mapping: Try to find by ID (legacy) or match label directly
        let selectedLabel = null;

        const raw = String(answer.selectedOption);

        // 1️⃣ Match by label
        const optionByLabel = question.options.find(
          o => o.label.toUpperCase() === raw.toUpperCase()
        );

        // 2️⃣ Match by value
        const optionByValue = question.options.find(
          o => o.value === raw
        );

        // 3️⃣ Match by ObjectId
        const optionById = question.options.find(
          o => o._id.toString() === raw
        );

        selectedLabel =
          optionByLabel?.label ||
          optionByValue?.label ||
          optionById?.label ||
          null;

        console.log(`Q${idx + 1} [${question._id}]:`, {
          raw: answer.selectedOption,
          mapped: selectedLabel,
          correct: question.correctAnswer
        });

        if (question.correctAnswer === selectedLabel) {
          score++;
        }
      }
    });

    attempt.score = score;
    await attempt.save();

    res.json({
      message: "Evaluation completed",
      score,
      totalPossible,
      percentage: totalPossible > 0 ? ((score / totalPossible) * 100).toFixed(2) : 0
    });

  } catch (err) {
    console.error("EvaluateAttempt Error:", err);
    res.status(500).json({ message: "Failed to evaluate attempt" });
  }
};

/*
|--------------------------------------------------------------------------
| GET ATTEMPT RESPONSE (For Manual Review)
|--------------------------------------------------------------------------
*/
exports.getAttemptResponse = async (req, res) => {
  try {
    const { attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt ID" });
    }

    const attempt = await ExamAttempt.findById(attemptId).populate("userId", "name email");
    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    const response = await ExamResponse.findOne({ attemptId });
    if (!response) {
      return res.status(404).json({ message: "No response found for this attempt" });
    }

    // Join questions with student answers
    const questionIds = response.answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

    console.log(questions, response.answers)
    const detailedAnswers = response.answers.map(ans => {
      const q = questions.find(query => query._id.toString() === ans.questionId.toString());

      // Robust lookup
      const optionMatch = q ? (
        q.options.find(o => o.label === ans.selectedOption) ||
        q.options.find(o => o.value === ans.selectedOption) ||
        q.options.find(o => o._id.toString() === ans.selectedOption.toString())
      ) : null;

      const selectedLabel = optionMatch ? optionMatch.label : ans.selectedOption;
      const selectedText = optionMatch ? optionMatch.value : ans.selectedOption;
      const correctLabel = q ? q.correctAnswer : null;
      const correctOptionMatch = q ? q.options.find(o => o.label === q.correctAnswer) : null;
      const correctText = correctOptionMatch ? correctOptionMatch.value : q.correctAnswer;

      const autoCorrect = q ? correctLabel === selectedLabel : false;
      const isOverridden = ans.isCorrectOverride !== null && ans.isCorrectOverride !== undefined;

      return {
        questionId: ans.questionId,
        questionText: q ? q.text : "Question Deleted",
        questionImageUrl: q ? (q.imageUrl || null) : null,
        options: q ? q.options : [],
        selectedLabel: selectedLabel,
        selectedOption: selectedText,
        correctOption: correctText,
        correctLabel: correctLabel,
        isCorrect: isOverridden ? ans.isCorrectOverride : autoCorrect,
        isOverridden,
      };
    });

    res.json({
      data: {
        attempt,
        answers: detailedAnswers
      }
    });

  } catch (err) {
    console.error("GetAttemptResponse Error:", err);
    res.status(500).json({ message: "Failed to fetch attempt response" });
  }
};
/*
|--------------------------------------------------------------------------
| OVERRIDE INDIVIDUAL ANSWER CORRECTNESS
|--------------------------------------------------------------------------
*/
exports.overrideAnswers = async (req, res) => {
  try {
    const { attemptId } = req.params;
    // overrides: [{ questionId, isCorrect }]  — null isCorrect resets to auto
    const { overrides } = req.body;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt ID" });
    }

    if (!Array.isArray(overrides)) {
      return res.status(400).json({ message: "overrides must be an array" });
    }

    const response = await ExamResponse.findOne({ attemptId });
    if (!response) return res.status(404).json({ message: "Response not found" });

    // Apply overrides to each answer subdocument
    for (const { questionId, isCorrect } of overrides) {
      const ans = response.answers.find(a => a.questionId.toString() === questionId.toString());
      if (ans) {
        ans.isCorrectOverride = isCorrect ?? null;
      }
    }
    await response.save();

    // Recalculate score: override wins; fall back to auto-eval
    const questionIds = response.answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

    let score = 0;
    for (const ans of response.answers) {
      const isOverridden = ans.isCorrectOverride !== null && ans.isCorrectOverride !== undefined;
      if (isOverridden) {
        if (ans.isCorrectOverride) score++;
      } else {
        const q = questions.find(q => q._id.toString() === ans.questionId.toString());
        if (q) {
          const raw = String(ans.selectedOption);
          const optByLabel = q.options.find(o => o.label.toUpperCase() === raw.toUpperCase());
          const optByValue = q.options.find(o => o.value === raw);
          const optById = q.options.find(o => o._id.toString() === raw);
          const selectedLabel = optByLabel?.label || optByValue?.label || optById?.label || raw;
          if (q.correctAnswer === selectedLabel) score++;
        }
      }
    }

    await ExamAttempt.findByIdAndUpdate(attemptId, { score });

    res.json({ message: "Overrides saved", score });
  } catch (err) {
    console.error("OverrideAnswers Error:", err);
    res.status(500).json({ message: "Failed to save overrides" });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE SCORE MANUALLY
|--------------------------------------------------------------------------
*/
exports.updateScore = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { score } = req.body;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt ID" });
    }

    const parsed = Number(score);
    if (score === undefined || score === null || isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ message: "Invalid score value" });
    }

    const attempt = await ExamAttempt.findByIdAndUpdate(
      attemptId,
      { score: parsed },
      { new: true }
    );

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    res.json({ message: "Score updated successfully", score: attempt.score });
  } catch (err) {
    console.error("UpdateScore Error:", err);
    res.status(500).json({ message: "Failed to update score" });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL Active User
|--------------------------------------------------------------------------
*/
exports.getTotalUserNo = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Check cache
    let totalUserCount = await redis.get(`totalUserCount:${userId}`);

    if (!totalUserCount) {
      // 2️⃣ Fetch from DB
      totalUserCount = await User.countDocuments({ role: "student" });

      // 3️⃣ Store in Redis with TTL (10 minutes)
      await redis.set(`totalUserCount:${userId}`, totalUserCount, "EX", 600);
    }

    res.status(200).json(Number(totalUserCount));

  } catch (error) {
    console.log("Error while fetching total user count:", error.message);
    res.status(500).json({ message: error.message });
  }
};