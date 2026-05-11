require("dotenv").config();
const mongoose = require("mongoose");
const XLSX = require("xlsx");
const connectDB = require("./src/config/db");
const Question = require("./src/models/Question");
const loadQuestionsToRedis = require("./src/utils/loadQuestionsToRedis");

const filePath = 'C:\\Users\\puska\\Downloads\\Test Questions.xlsx';

const seedQuestions = async () => {
    try {
        await connectDB();

        console.log("Clearing existing questions...");
        await Question.deleteMany({});

        console.log("Reading Excel file...");
        const workbook = XLSX.readFile(filePath);
        const questionsToInsert = [];
        const foundClasses = new Set();

        for (const sheetName of workbook.SheetNames) {
            console.log(`Processing sheet: ${sheetName}`);
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Data starts from index 3 (Row 4)
            const dataRows = data.slice(3);
            console.log(`Found ${dataRows.length} rows in sheet ${sheetName}.`);

            for (const row of dataRows) {
                if (!row || row.length === 0 || !row[1]) continue;

                const text = row[1]?.toString().trim();
                if (text.length < 5) continue;

                const options = [];
                if (row[2] && row[3] !== undefined) options.push({ label: row[2].toString().trim(), value: row[3].toString().trim() });
                if (row[4] && row[5] !== undefined) options.push({ label: row[4].toString().trim(), value: row[5].toString().trim() });
                if (row[6] && row[7] !== undefined) options.push({ label: row[6].toString().trim(), value: row[7].toString().trim() });
                if (row[8] && row[9] !== undefined) options.push({ label: row[8].toString().trim(), value: row[9].toString().trim() });

                const correctAnswer = row[10]?.toString().trim();
                const difficulty = row[11]?.toString().trim().toLowerCase();
                const board = row[12]?.toString().trim() || "General";
                const subject = row[13]?.toString().trim();
                
                // Prefer sheet name for class consistency (e.g., "Class 2")
                const className = sheetName.trim();
                foundClasses.add(className);

                if (!text || !correctAnswer || !difficulty || !subject) {
                    console.log(`Skipping row in ${sheetName} due to missing required fields: ${text?.substring(0, 50)}...`);
                    continue;
                }

                const questionData = {
                    text,
                    type: "mcq",
                    options,
                    correctAnswer,
                    difficulty,
                    board,
                    subject,
                    class: className
                };

                const optionLabels = options.map(o => o.label);
                if (!optionLabels.includes(correctAnswer)) {
                    console.log(`[VALIDATION FAILED] Sheet: ${sheetName}, Row: ${text.substring(0, 30)}...`);
                    console.log(`  CorrectAnswer: "${correctAnswer}"`);
                    console.log(`  Labels: ${JSON.stringify(optionLabels)}`);
                    continue;
                }

                questionsToInsert.push(questionData);
            }
        }

        if (questionsToInsert.length > 0) {
            console.log(`Inserting ${questionsToInsert.length} questions into DB...`);
            await Question.insertMany(questionsToInsert);
            console.log("Successfully inserted questions.");

            // Sync Classes to SystemSetting
            console.log("Syncing classes to SystemSetting...");
            const SystemSetting = require("./src/models/SystemSetting");
            const setting = await SystemSetting.findOne({ key: "availableClasses" });
            let existingClasses = setting ? setting.value : ["General", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
            
            let updated = false;
            for (const c of foundClasses) {
                if (!existingClasses.includes(c)) {
                    existingClasses.push(c);
                    updated = true;
                }
            }
            if (updated) {
                await SystemSetting.findOneAndUpdate(
                    { key: "availableClasses" },
                    { value: existingClasses },
                    { upsert: true }
                );
                console.log("Updated availableClasses in SystemSetting.");
            }

            try {
                console.log("Loading questions into Redis...");
                await loadQuestionsToRedis();
                console.log("Redis loaded.");
            } catch (err) {
                console.log("Warning: Redis loading failed:", err.message);
            }
        } else {
            console.log("No valid questions found to insert.");
        }

        console.log("Done.");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding questions:", error);
        process.exit(1);
    }
};

seedQuestions();
