require('dotenv').config();
const mongoose = require('mongoose');
const Notification = require('./src/models/Notification');
const User = require('./src/models/User');

const seedNotifications = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const user = await User.findOne({ role: 'admin' });
        if (!user) {
            console.log('No admin user found to seed notifications for.');
            return;
        }

        const notifications = [
            {
                userId: user._id,
                title: 'Welcome to the Dashboard',
                message: 'You have successfully set up the notification system.',
                type: 'success'
            },
            {
                userId: user._id,
                title: 'System Update',
                message: 'A new version of the Exam Management System is available.',
                type: 'info'
            },
            {
                userId: user._id,
                title: 'Database Warning',
                message: 'The database connection is slightly slow today.',
                type: 'warning'
            }
        ];

        await Notification.insertMany(notifications);
        console.log('Seed notifications created!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding notifications:', error);
        process.exit(1);
    }
};

seedNotifications();
