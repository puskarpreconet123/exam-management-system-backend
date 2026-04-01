const mongoose = require("mongoose");
require("dotenv").config();

const Question = require("./src/models/Question");
const Exam = require("./src/models/Exam");
const User = require("./src/models/User");

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const questionRes = await Question.updateMany({ board: { $exists: false } }, { $set: { board: "General", class: "General" } });
        console.log("Updated Questions:", questionRes.modifiedCount);

        const examRes = await Exam.updateMany({ board: { $exists: false } }, { $set: { board: "General", class: "General" } });
        console.log("Updated Exams:", examRes.modifiedCount);

        const userRes = await User.updateMany(
            { role: "student", $or: [{ "studentDetails.board": { $exists: false } }, { "studentDetails.className": { $exists: false } }] },
            { $set: { "studentDetails.board": "General", "studentDetails.className": "General" } }
        );
        console.log("Updated Users:", userRes.modifiedCount);

        console.log("Migration Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Migration Failed:", err);
        process.exit(1);
    }
}

migrate();
