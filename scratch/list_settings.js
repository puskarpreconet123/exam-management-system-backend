require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const SystemSetting = require("../src/models/SystemSetting");

const listSettings = async () => {
    await connectDB();
    const settings = await SystemSetting.find();
    console.log('Current Settings:');
    settings.forEach(s => {
        console.log(`${s.key}:`, JSON.stringify(s.value));
    });
    process.exit(0);
};

listSettings();
