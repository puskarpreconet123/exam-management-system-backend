require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const Exam = require("./src/models/Exam");
const Question = require("./src/models/Question");
const ExamAttempt = require("./src/models/ExamAttempt");
const ExamResponse = require("./src/models/ExamResponse");
const loadQuestionsToRedis = require("./src/utils/loadQuestionsToRedis");

const subjects = ["Maths", "English", "Science"];
const difficulties = ["easy", "medium", "hard"];

const demoQuestions = [
    // Maths - Easy
    { text: "What is 5 + 7?", options: [{ label: "10", value: "10" }, { label: "11", value: "11" }, { label: "12", value: "12" }, { label: "13", value: "13" }], correctAnswer: "12", difficulty: "easy", subject: "Maths", board: "General", class: "General" },
    { text: "What is 15 - 8?", options: [{ label: "5", value: "5" }, { label: "6", value: "6" }, { label: "7", value: "7" }, { label: "8", value: "8" }], correctAnswer: "7", difficulty: "easy", subject: "Maths", board: "General", class: "General" },
    { text: "What is 4 * 3?", options: [{ label: "10", value: "10" }, { label: "11", value: "11" }, { label: "12", value: "12" }, { label: "14", value: "14" }], correctAnswer: "12", difficulty: "easy", subject: "Maths", board: "General", class: "General" },
    
    // Maths - Medium
    { text: "Solve for x: 2x + 5 = 15", options: [{ label: "3", value: "3" }, { label: "5", value: "5" }, { label: "7", value: "7" }, { label: "10", value: "10" }], correctAnswer: "5", difficulty: "medium", subject: "Maths", board: "General", class: "General" },
    { text: "What is the square root of 144?", options: [{ label: "10", value: "10" }, { label: "12", value: "12" }, { label: "14", value: "14" }, { label: "16", value: "16" }], correctAnswer: "12", difficulty: "medium", subject: "Maths", board: "General", class: "General" },
    
    // English - Easy
    { text: "Which word is a noun?", options: [{ label: "Run", value: "Run" }, { label: "Beautiful", value: "Beautiful" }, { label: "Apple", value: "Apple" }, { label: "Quickly", value: "Quickly" }], correctAnswer: "Apple", difficulty: "easy", subject: "English", board: "General", class: "General" },
    { text: "What is the opposite of 'Happy'?", options: [{ label: "Joyful", value: "Joyful" }, { label: "Sad", value: "Sad" }, { label: "Excited", value: "Excited" }, { label: "Angry", value: "Angry" }], correctAnswer: "Sad", difficulty: "easy", subject: "English", board: "General", class: "General" },
    
    // Science - Easy
    { text: "What planet is known as the Red Planet?", options: [{ label: "Earth", value: "Earth" }, { label: "Mars", value: "Mars" }, { label: "Jupiter", value: "Jupiter" }, { label: "Venus", value: "Venus" }], correctAnswer: "Mars", difficulty: "easy", subject: "Science", board: "General", class: "General" },
    { text: "What gas do humans breathe in to survive?", options: [{ label: "Carbon Dioxide", value: "Carbon Dioxide" }, { label: "Nitrogen", value: "Nitrogen" }, { label: "Oxygen", value: "Oxygen" }, { label: "Hydrogen", value: "Hydrogen" }], correctAnswer: "Oxygen", difficulty: "easy", subject: "Science", board: "General", class: "General" },
];

// Helper to generate more questions to satisfy counts
const generateBatch = (subject, count) => {
    const batch = [];
    for (let i = 1; i <= count; i++) {
        batch.push({
            text: `Sample ${subject} Question ${i}?`,
            options: [
                { label: "Option A", value: "Option A" },
                { label: "Option B", value: "Option B" },
                { label: "Option C", value: "Option C" },
                { label: "Option D", value: "Option D" }
            ],
            correctAnswer: "Option A",
            difficulty: "easy",
            subject: subject,
            board: "General",
            class: "General"
        });
    }
    return batch;
};

const runFixAndSeed = async () => {
    try {
        await connectDB();
        console.log("Connected to database.");

        // 1. Clean Orphaned Records
        console.log("Finding orphaned records...");
        const attempts = await ExamAttempt.find().lean();
        const orphanedAttemptIds = [];
        for (const attempt of attempts) {
            const exam = await Exam.findById(attempt.examId);
            if (!exam) {
                orphanedAttemptIds.push(attempt._id);
            }
        }

        if (orphanedAttemptIds.length > 0) {
            console.log(`Deleting ${orphanedAttemptIds.length} orphaned attempts and their responses...`);
            await ExamAttempt.deleteMany({ _id: { $in: orphanedAttemptIds } });
            await ExamResponse.deleteMany({ attemptId: { $in: orphanedAttemptIds } });
        } else {
            console.log("No orphaned attempts found.");
        }

        // 1.5 Clean Orphaned Responses (missing Attempt)
        console.log("Finding orphaned responses (missing attempt)...");
        const allResponses = await ExamResponse.find().lean();
        const orphanedRespIds = [];
        for (const resp of allResponses) {
            const attempt = await ExamAttempt.findById(resp.attemptId);
            if (!attempt) {
                orphanedRespIds.push(resp._id);
            }
        }
        if (orphanedRespIds.length > 0) {
            console.log(`Deleting ${orphanedRespIds.length} orphaned responses...`);
            await ExamResponse.deleteMany({ _id: { $in: orphanedRespIds } });
        } else {
            console.log("No orphaned responses found.");
        }

        // 2. Seed Demo Questions
        console.log("Seeding demo questions...");
        const allQuestions = [
            ...demoQuestions,
            ...generateBatch("Maths", 10),
            ...generateBatch("English", 10),
            ...generateBatch("Science", 10)
        ];
        
        await Question.insertMany(allQuestions);
        console.log(`Inserted ${allQuestions.length} demo questions.`);

        // 3. Seed Demo Exams
        console.log("Seeding demo exams...");
        const past = new Date();
        past.setHours(past.getHours() - 1);
        const future = new Date();
        future.setFullYear(future.getFullYear() + 1);

        const demoExams = [
            {
                title: "Practice Math Quiz",
                totalQuestions: 5,
                subjects: [{ subject: "Maths", count: 5 }],
                distribution: { easy: 100, medium: 0, hard: 0 },
                duration: 15,
                schedulingType: "range",
                startTime: past,
                endTime: future,
                status: "active",
                board: "General",
                class: "General"
            },
            {
                title: "General Knowledge Demo",
                totalQuestions: 10,
                subjects: [
                    { subject: "English", count: 5 },
                    { subject: "Science", count: 5 }
                ],
                distribution: { easy: 100, medium: 0, hard: 0 },
                duration: 20,
                schedulingType: "range",
                startTime: past,
                endTime: future,
                status: "active",
                board: "General",
                class: "General"
            }
        ];

        await Exam.insertMany(demoExams);
        console.log(`Inserted ${demoExams.length} demo exams.`);

        // 4. Load into Redis
        try {
            console.log("Syncing to Redis...");
            await loadQuestionsToRedis();
            console.log("Redis sync complete.");
        } catch (err) {
            console.log("Warning: Redis sync failed (it might not be running). The app will reload on restart. Error:", err.message);
        }

        console.log("Execution successful.");
        process.exit(0);
    } catch (error) {
        console.error("Critical Error during fix and seed:", error);
        process.exit(1);
    }
};

runFixAndSeed();
