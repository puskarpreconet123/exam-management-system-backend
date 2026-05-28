const mongoose = require("mongoose");
const Exam = require("../../models/Exam");
const ExamAttempt = require("../../models/ExamAttempt");
const User = require("../../models/User");
const { redis } = require("../../config/redis");
const ExamResponse = require("../../models/ExamResponse");
const Question = require("../../models/Question");
const notificationService = require("../../services/notificationService");
const actionLogService = require("../../services/actionLogService");
const SystemSetting = require("../../models/SystemSetting");
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
      status: "scheduled",
    });

    res.status(201).json({
      message: "Exam created successfully",
      exam,
    });

    // ✨ Notifications
    const boardStr = board || "General";
    const classStr = className || "General";

    // 1. Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Exam Created",
      `Exam "${title}" has been successfully created for ${boardStr} ${classStr}.`,
      "success"
    );

    // 2. Notify Target Students
    await notificationService.notifyStudentsByCriteria(
      { board: boardStr, class: classStr },
      "New Exam Published",
      `A new exam "${title}" has been published. Check your upcoming exams!`,
      "info"
    );

    // 🔒 Log Action
    await actionLogService.logAction(
      req,
      "CREATE_EXAM",
      exam._id.toString(),
      "Exam",
      { title: exam.title, board: exam.board, class: exam.class }
    );

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
    const now = new Date();

    // Calculate basic stats for the dashboard
    const liveCount = await Exam.countDocuments({
      $or: [
        {
          schedulingType: "range",
          startTime: { $lte: now },
          endTime: { $gte: now }
        },
        {
          schedulingType: { $ne: "range" }, // fixed
          startTime: { $lte: now },
          $expr: {
            $gte: [
              { $add: ["$startTime", { $multiply: ["$duration", 60 * 1000] }] },
              now
            ]
          }
        }
      ]
    });

    const upcomingCount = await Exam.countDocuments({
        startTime: { $gt: now }
    });

    res.status(200).json({
      success: true,
      data: exams,
      stats: {
          total,
          live: liveCount,
          upcoming: upcomingCount,
          completed: total - liveCount - upcomingCount
      },
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GetExams Error:", err);
    res.status(500).json({
      message: "Failed to fetch exams",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SIMPLE EXAMS LIST (For dropdowns)
|--------------------------------------------------------------------------
*/
exports.getSimpleExamsList = async (req, res) => {
  try {
    const exams = await Exam.find()
      .select("title")
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(exams);
  } catch (err) {
    console.error("GetSimpleExamsList Error:", err);
    res.status(500).json({ message: "Failed to fetch simple exams list" });
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

    // ✨ Notify Student
    if (attempt.userId) {
      // Fetch exam title for better message
      const exam = await Exam.findById(attempt.examId).select("title").lean();
      await notificationService.notifyUser(
        attempt.userId,
        "Result Published",
        `Your result for exam "${exam?.title || 'Unknown'}" has been published.`,
        "success"
      );
    }
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
| EVALUATE ALL ATTEMPTS FOR AN EXAM
|--------------------------------------------------------------------------
*/
exports.evaluateAllAttempts = async (req, res) => {
  try {
    const { examId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }

    // 1. Get all submitted/timeout attempts with null score
    const attempts = await ExamAttempt.find({
      examId,
      status: { $in: ["submitted", "timeout"] },
      score: null
    });

    if (attempts.length === 0) {
      return res.json({ message: "No pending attempts to evaluate", count: 0 });
    }

    const attemptIds = attempts.map(a => a._id);

    // 2. Get all responses for these attempts to collect question IDs
    const responses = await ExamResponse.find({ attemptId: { $in: attemptIds } });
    
    // 3. Collect all unique question IDs
    const questionIdSet = new Set();
    responses.forEach(r => {
      if (r.answers) {
        r.answers.forEach(ans => {
          if (ans.questionId) questionIdSet.add(ans.questionId.toString());
        });
      }
    });

    // 4. Fetch all questions at once
    const questions = await Question.find({ _id: { $in: Array.from(questionIdSet) } });
    const questionMap = new Map(questions.map(q => [q._id.toString(), q]));

    let evaluatedCount = 0;

    // 5. Evaluate each attempt
    for (const attempt of attempts) {
      const response = responses.find(r => r.attemptId.toString() === attempt._id.toString());
      if (!response || !response.answers) continue;
      
      let score = 0;
      response.answers.forEach(answer => {
        // Admin Overrides
        if (answer.isCorrectOverride === true) {
          score++;
          return;
        }
        if (answer.isCorrectOverride === false) {
          return;
        }

        const question = questionMap.get(answer.questionId.toString());
        if (question) {
          const raw = String(answer.selectedOption || "");
          
          if (question.type === "tita") {
            if (question.correctAnswer.trim().toLowerCase() === raw.trim().toLowerCase()) {
              score++;
            }
          } else {
            // MCQ / MCQ_IMAGE
            const optionByLabel = question.options.find(o => o.label.toUpperCase() === raw.toUpperCase());
            const optionByValue = question.options.find(o => o.value === raw);
            const optionById = question.options.find(o => o._id && o._id.toString() === raw);
            
            const selectedLabel = optionByLabel?.label || optionByValue?.label || optionById?.label || null;
            if (question.correctAnswer === selectedLabel) {
              score++;
            }

          }
        }
      });
      
      attempt.score = score;
      await attempt.save();
      evaluatedCount++;
    }

    res.json({
      message: `Successfully evaluated ${evaluatedCount} attempts`,
      count: evaluatedCount
    });

  } catch (err) {
    console.error("EvaluateAllAttempts Error:", err);
    res.status(500).json({ message: "Failed to evaluate attempts" });
  }
};


/*
|--------------------------------------------------------------------------
| PUBLISH ALL RESULTS FOR AN EXAM
|--------------------------------------------------------------------------
*/
exports.publishAllResults = async (req, res) => {
  try {
    const { examId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }

    // Publish all attempts for this exam that have a score and are not yet published
    const result = await ExamAttempt.updateMany(
      { examId, score: { $ne: null }, isPublished: false },
      { $set: { isPublished: true } }
    );

    res.json({
      message: `Successfully published ${result.modifiedCount} results`,
      count: result.modifiedCount
    });

    // Optional: Notify students (maybe in background to avoid blocking)
    // For now, we'll skip detailed individual notifications in bulk to save resources
    // or just notify the admin that it's done.

  } catch (err) {
    console.error("PublishAllResults Error:", err);
    res.status(500).json({ message: "Failed to publish results" });
  }
};

/*
|--------------------------------------------------------------------------
| GET DASHBOARD STATISTICS
|--------------------------------------------------------------------------
*/
exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    
    // 1. Basic Stats
    const totalExams = await Exam.countDocuments();
    const upcomingExams = await Exam.countDocuments({ startTime: { $gt: now } });
    const totalStudents = await User.countDocuments({ role: "student" });
    const totalQuestions = await Question.countDocuments();
    
    // 2. Pending Evaluations (Submitted/Timeout attempts with null score)
    const pendingEvaluations = await ExamAttempt.countDocuments({
      status: { $in: ["submitted", "timeout"] },
      score: null
    });

    // 3. Average Pass Rate
    // Let's get attempts that HAVE a score and join with Exam to get totalQuestions
    const attemptsWithScore = await ExamAttempt.aggregate([
      { $match: { score: { $ne: null } } },
      {
        $lookup: {
          from: "exams",
          localField: "examId",
          foreignField: "_id",
          as: "exam"
        }
      },
      { $unwind: "$exam" },
      {
        $project: {
          percentage: {
            $multiply: [{ $divide: ["$score", "$exam.totalQuestions"] }, 100]
          }
        }
      }
    ]);

    const avgPassRate = attemptsWithScore.length > 0 
      ? (attemptsWithScore.reduce((sum, a) => sum + a.percentage, 0) / attemptsWithScore.length).toFixed(1)
      : 0;

    // 4. Exam Completion Distribution
    const completionStats = await ExamAttempt.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const distribution = {
      completed: 0,
      pending: 0,
      failed: 0, // We can define failed as score < 40% if we want
      excused: 0 // placeholder
    };

    completionStats.forEach(s => {
      if (s._id === "submitted") distribution.completed = s.count;
      if (s._id === "active") distribution.pending = s.count;
      // timeout could be failed or completed depending on policy, let's put in completed for now if evaluated
    });

    // 5. Usage Statistics (Attempts per month for last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);

    const usageStats = await ExamAttempt.aggregate([
      { $match: { createdAt: { $gt: twelveMonthsAgo } } },
      {
        $group: {
          _id: { 
            month: { $month: "$createdAt" }, 
            year: { $year: "$createdAt" } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.status(200).json({
      totalExams,
      upcomingExams,
      totalStudents,
      totalQuestions,
      pendingEvaluations,
      avgPassRate: Number(avgPassRate),
      distribution,
      usageStats,
      upcomingExamsList: await Exam.find({ startTime: { $gt: now } }).sort({ startTime: 1 }).limit(4).lean()
    });

  } catch (error) {
    console.error("DashboardStats Error:", error.message);
    res.status(500).json({ message: "Failed to fetch dashboard statistics" });
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

/*
|--------------------------------------------------------------------------
| UPDATE EXAM
|--------------------------------------------------------------------------
*/
exports.updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      totalQuestions,
      difficultyDistribution,
      durationMinutes,
      startTime,
      schedulingType,
      endTime,
      subjects,
      board,
      class: className,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (board) updateData.board = board.trim();
    if (className) updateData.class = className.trim();
    if (schedulingType) updateData.schedulingType = schedulingType;
    if (startTime) updateData.startTime = new Date(startTime);
    if (endTime) updateData.endTime = new Date(endTime);
    
    if (subjects) {
        updateData.subjects = subjects.map(s => ({
            subject: s.subject,
            count: Number(s.count)
        }));
        updateData.totalQuestions = updateData.subjects.reduce((sum, s) => sum + s.count, 0);
    }

    if (difficultyDistribution) {
        updateData.distribution = {
            easy: Number(difficultyDistribution.easy || 0),
            medium: Number(difficultyDistribution.medium || 0),
            hard: Number(difficultyDistribution.hard || 0)
        };
        
        if (updateData.distribution.easy + updateData.distribution.medium + updateData.distribution.hard !== 100) {
            return res.status(400).json({ message: "Difficulty distribution must total 100%" });
        }
    }

    if (durationMinutes) {
        updateData.duration = Number(durationMinutes);
    }

    const exam = await Exam.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.json({ message: "Exam updated successfully", exam });

    // ✨ Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Exam Updated",
      `Exam "${exam.title}" has been updated.`,
      "info"
    );

    // 🔒 Log Action
    await actionLogService.logAction(
      req,
      "UPDATE_EXAM",
      id,
      "Exam",
      { title: exam.title }
    );
  } catch (err) {
    console.error("UpdateExam Error:", err);
    res.status(500).json({ message: err.message || "Failed to update exam" });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE EXAM
|--------------------------------------------------------------------------
*/
exports.deleteExam = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid exam ID" });
    }

    // Check if there are any attempts for this exam
    const attemptsCount = await ExamAttempt.countDocuments({ examId: id });
    if (attemptsCount > 0) {
        return res.status(400).json({ 
            message: "Cannot delete exam with existing attempts. Archive it instead or contact support." 
        });
    }

    const exam = await Exam.findByIdAndDelete(id);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.json({ message: "Exam deleted successfully" });

    // ✨ Notify Admin
    await notificationService.notifyUser(
      req.user.id,
      "Exam Deleted",
      `Exam "${exam.title}" has been deleted.`,
      "warning"
    );

    // 🔒 Log Action
    await actionLogService.logAction(
      req,
      "DELETE_EXAM",
      id,
      "Exam",
      { title: exam.title }
    );
  } catch (err) {
    console.error("DeleteExam Error:", err);
    res.status(500).json({ message: "Failed to delete exam" });
  }
};