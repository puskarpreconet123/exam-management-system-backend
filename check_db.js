const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function checkData() {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const students = await User.find({ role: 'student' }).limit(5);

        console.log('Total students found:', students.length);
        
        students.forEach((s, i) => {
            console.log(`\nStudent ${i+1}: ${s.name}`);
            console.log('Keys available:', Object.keys(s._doc));
            if (s.studentDetails) console.log('studentDetails keys:', Object.keys(s.studentDetails));
            if (s.guardianDetails) console.log('guardianDetails keys:', Object.keys(s.guardianDetails));
            if (s.address) console.log('address keys:', Object.keys(s.address));
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
