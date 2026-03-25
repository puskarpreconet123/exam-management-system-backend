require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./src/config/db");
const Exam = require("./src/models/Exam");
const Question = require("./src/models/Question");
const loadQuestionsToRedis = require("./src/utils/loadQuestionsToRedis");

const seedExams = async () => {
    await connectDB();
    
    console.log("Seeding Demo Exams...");
    
    const now = new Date();
    const past = new Date();
    past.setHours(past.getHours() - 1); // Start 1 hour ago so it's instantly active
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    
    const exams = [
        {
            title: "Demo Exam 1: Mathematics",
            totalQuestions: 10,
            subjects: [{ subject: "Math", count: 10 }],
            distribution: { easy: 100, medium: 0, hard: 0 },
            duration: 10,
            schedulingType: "range",
            startTime: past,
            endTime: future,
            status: "active"
        },
        {
            title: "Demo Exam 2: Science Test",
            totalQuestions: 10,
            subjects: [{ subject: "Science", count: 10 }],
            distribution: { easy: 100, medium: 0, hard: 0 },
            duration: 5,
            schedulingType: "range",
            startTime: past,
            endTime: future,
            status: "active"
        },
        {
            title: "Demo Exam 3: English Basics",
            totalQuestions: 10,
            subjects: [{ subject: "English", count: 10 }],
            distribution: { easy: 100, medium: 0, hard: 0 },
            duration: 15,
            schedulingType: "range",
            startTime: past,
            endTime: future,
            status: "active"
        }
    ];
    
    await Exam.insertMany(exams);
    console.log("Inserted 3 Demo Exams");
    
    try {
        console.log("Loading questions into Redis so they can be served...");
        await loadQuestionsToRedis();
        console.log("Redis loaded.");
    } catch (err) {
        console.log("Warning: Redis loading script failed. The backend server on restart will auto-load them. Error:", err.message);
    }
    
    console.log("Done.");
    process.exit(0);
}

seedExams().catch(err => {
    console.error(err);
    process.exit(1);
});
