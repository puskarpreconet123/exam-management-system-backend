const Exam = require("../models/Exam");
const ExamAttempt = require("../models/ExamAttempt");
const ExamResponse = require("../models/ExamResponse");
const Question = require("../models/Question");
const { redis } = require("../config/redis");
const mongoose = require("mongoose");

/*
========================================
START OR RESUME EXAM
========================================
*/
exports.handleStartOrResume = async (examId, userId) => {
  const now = new Date();

  // 1️⃣ Get exam from cache or DB
  let exam = await redis.get(`exam:${examId}`);

  if (exam) {
    exam = JSON.parse(exam);
  } else {
    exam = await Exam.findById(examId).lean();
    if (!exam) throw new Error("Exam not found");

    await redis.set(`exam:${examId}`, JSON.stringify(exam), "EX", 600);
  }

  if (now < new Date(exam.startTime))
    throw new Error("Exam not started yet");

  // 2️⃣ Check existing attempt
  let attempt = await ExamAttempt.findOne({ examId, userId }).lean();

  if (attempt) {
    return resumeAttempt(attempt);
  }

  return generateNewAttempt(exam, userId);
};

/*
========================================
RESUME
========================================
*/
async function resumeAttempt(attempt) {
  if (attempt.status !== "active")
    throw new Error("Exam already submitted");

  const now = new Date();
  if (now > attempt.expiresAt)
    throw new Error("Exam expired");

  const remainingSeconds = Math.floor(
    (new Date(attempt.expiresAt) - now) / 1000
  );

  // Restore session TTL
  await redis.set(
    `attempt:${attempt._id}`,
    JSON.stringify({
      userId: attempt.userId.toString(),
      expiresAt: attempt.expiresAt,
    }),
    "EX",
    remainingSeconds
  );

  await redis.sadd("dirty_attempts", attempt._id);

  const responseDoc = await ExamResponse.findOne({
    attemptId: attempt._id,
  }).lean();

  const unorderedQuestions = await Question.find({
    _id: { $in: responseDoc.questionIds },
  })
    .select("-correctAnswer")
    .lean();

  const questions = responseDoc.questionIds.map(id => unorderedQuestions.find(q => q._id.toString() === id.toString()));

  return {
    attemptId: attempt._id,
    remainingTime: remainingSeconds,
    questions,
    answers: responseDoc.answers || [],
    resumed: true,
  };
}

/*
========================================
GENERATE NEW ATTEMPT
========================================
*/
async function generateNewAttempt(exam, userId) {
  let questionIds = [];

  for (let s of exam.subjects) {
    const sTotal = s.count;
    const easyCount = Math.floor((exam.distribution.easy / 100) * sTotal);
    const mediumCount = Math.floor((exam.distribution.medium / 100) * sTotal);
    const hardCount = sTotal - easyCount - mediumCount;

    const board = exam.board || 'General';
    const examClass = exam.class || 'General';

    const [easy, medium, hard] = await Promise.all([
      redis.srandmember(`questions:${board}:${examClass}:${s.subject}:easy`, easyCount),
      redis.srandmember(`questions:${board}:${examClass}:${s.subject}:medium`, mediumCount),
      redis.srandmember(`questions:${board}:${examClass}:${s.subject}:hard`, hardCount),
    ]);
    
    // Ensure we don't encounter errors if there are not enough questions
    questionIds.push(...(easy || []), ...(medium || []), ...(hard || []));
  }

  // Questions are already appended in Subject > Difficulty order
  // Optional: you can shuffle *within* a difficulty group if needed, but not globally.
  // We'll leave them in the exact order fetched.

  const now = new Date();
  const durationSeconds = exam.duration * 60;
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [attempt] = await ExamAttempt.create(
      [{
        examId: exam._id,
        userId,
        startedAt: now,
        expiresAt,
        status: "active",
        isDemo: Boolean(exam.title && exam.title.toLowerCase().startsWith("demo exam")),
      }],
      { session }
    );

    await ExamResponse.create(
      [{
        attemptId: attempt._id,
        examId: exam._id,
        questionIds,
        answers: [],
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Store session in Redis
    await redis.set(
      `attempt:${attempt._id}`,
      JSON.stringify({
        userId,
        expiresAt,
      }),
      "EX",
      durationSeconds
    );

    await redis.set(`answers:${attempt._id}`, JSON.stringify({}));

    await redis.sadd("dirty_attempts", attempt._id);

    const unorderedQuestions = await Question.find({
      _id: { $in: questionIds },
    })
      .select("-correctAnswer")
      .lean();

    const questions = questionIds.map(id => unorderedQuestions.find(q => q._id.toString() === id.toString()));

    return {
      attemptId: attempt._id,
      remainingTime: durationSeconds,
      questions,
      answers: [],
      resumed: false,
    };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/*
========================================
SYNC ANSWERS (REDIS ONLY)
========================================
*/
exports.syncAnswersService = async (attemptId, userId, answers) => {
  // 1️⃣ Validate payload
  if (!Array.isArray(answers)) {
    throw new Error("Invalid payload");
  }

  // 2️⃣ Validate attempt session
  const attemptData = await redis.get(`attempt:${attemptId}`);
  if (!attemptData) {
    throw new Error("Session expired");
  }

  const attempt = JSON.parse(attemptData);

  if (String(attempt.userId) !== String(userId)) {
    throw new Error("Unauthorized");
  }

  if (answers.length > 200) {
    throw new Error("Too many answers");
  }

  const answerKey = `answers:${attemptId}`;

  // 3️⃣ Load existing answers safely
  let answerMap = {};
  const existing = await redis.get(answerKey);

  if (existing) {
    try {
      answerMap = JSON.parse(existing);
    } catch (err) {
      answerMap = {};
    }
  }

  // 4️⃣ Convert incoming payload to map (snapshot)
  const incomingMap = {};

  for (let ans of answers) {
    if (!ans.questionId) continue;
    if (!ans.selectedOption) continue;

    // Fix: Store the label (e.g. 'A') to match correctAnswer and for better readability
    const optionLabel =
      typeof ans.selectedOption === "object"
        ? (ans.selectedOption.label || ans.selectedOption._id)
        : ans.selectedOption;

    if (!optionLabel) continue;

    incomingMap[ans.questionId] = optionLabel;
  }

  // 5️⃣ Remove deleted answers (present in Redis but not in payload)
  for (let existingQid in answerMap) {
    if (!incomingMap[existingQid]) {
      delete answerMap[existingQid];
    }
  }

  // 6️⃣ Apply incoming answers
  Object.assign(answerMap, incomingMap);

  console.log("Updated Answer Map:", answerMap);

  // 7️⃣ Save back to Redis
  await redis.set(answerKey, JSON.stringify(answerMap));

  // 8️⃣ Mark attempt as dirty for background DB sync
  await redis.sadd("dirty_attempts", attemptId);

  return { success: true };
};

/*
========================================
SUBMIT EXAM
========================================
*/
exports.submitExamService = async (attemptId, userId) => {
  const lockKey = `submit_lock:${attemptId}`;
  const lock = await redis.set(lockKey, "1", "NX", "EX", 60);

  if (!lock) throw new Error("Submission in progress");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const attempt = await ExamAttempt.findById(attemptId)
      .session(session);

    if (!attempt) throw new Error("Attempt not found");
    if (attempt.userId.toString() !== userId)
      throw new Error("Unauthorized");
    
    // It could be 'submitted' manually from the controller or 'active' if caught by the cron
    if (attempt.score !== null)
      throw new Error("Already scored");

    const answerData = await redis.get(`answers:${attemptId}`);
    const answers = answerData ? JSON.parse(answerData) : {};

    const questionIds = Object.keys(answers);

    const questions = await Question.find({
      _id: { $in: questionIds },
    }).session(session);

    let score = 0;

    for (let q of questions) {
      if (answers[q._id.toString()] === q.correctAnswer)
        score++;
    }

    // Mark as submitted if not already done by controller
    if (attempt.status === "active") {
        attempt.status = "submitted"; // fallback cron sets this
    }
    if (!attempt.submittedAt) {
        attempt.submittedAt = new Date();
    }
    
    attempt.score = score;
    
    // Auto-publish if it's a Demo Exam
    if (attempt.isDemo) {
      attempt.isPublished = true;
    }

    await attempt.save({ session });

    await ExamResponse.updateOne(
      { attemptId },
      {
        $set: {
          answers: questionIds.map((qid) => ({
            questionId: qid,
            selectedOption: answers[qid],
          })),
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await redis.del(`attempt:${attemptId}`);
    await redis.del(`answers:${attemptId}`);
    await redis.del(lockKey);

    return { message: "Exam submitted successfully. Your result is pending review." };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    await redis.del(lockKey);
    throw err;
  }
};