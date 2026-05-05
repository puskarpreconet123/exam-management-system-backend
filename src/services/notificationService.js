const Notification = require("../models/Notification");
const User = require("../models/User");
const { getIO } = require("../config/socket");

/**
 * Creates a notification for a single user.
 * @param {string} userId - ID of the recipient.
 * @param {string} title - Notification title.
 * @param {string} message - Notification message.
 * @param {string} type - 'info', 'success', 'warning', 'error'.
 */
exports.notifyUser = async (userId, title, message, type = "info") => {
  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
    });

    // Emit real-time notification via socket
    try {
      const io = getIO();
      io.to(`user_${userId}`).emit("new_notification", notification);
    } catch (socketErr) {
      console.warn("Socket.io not initialized, skipping emit");
    }
  } catch (err) {
    console.error(`Failed to create notification for user ${userId}:`, err.message);
  }
};

/**
 * Creates notifications for all students matching specific criteria.
 * @param {object} criteria - MongoDB query criteria (e.g., { board: 'CBSE', class: '10' }).
 * @param {string} title - Notification title.
 * @param {string} message - Notification message.
 * @param {string} type - 'info', 'success', 'warning', 'error'.
 */
exports.notifyStudentsByCriteria = async (criteria, title, message, type = "info") => {
  try {
    // Transform criteria to match the studentDetails path in User model
    const query = { role: "student" };
    if (criteria.board) query["studentDetails.board"] = criteria.board;
    if (criteria.class) query["studentDetails.className"] = criteria.class;

    const students = await User.find(query).select("_id").lean();
    
    if (students.length === 0) return;

    const notifications = students.map((student) => ({
      userId: student._id,
      title,
      message,
      type,
    }));

    const createdNotifications = await Notification.insertMany(notifications);

    // Emit real-time notifications via socket
    try {
      const io = getIO();
      createdNotifications.forEach((n) => {
        io.to(`user_${n.userId}`).emit("new_notification", n);
      });
    } catch (socketErr) {
      console.warn("Socket.io not initialized, skipping emit");
    }
  } catch (err) {
    console.error(`Failed to create notifications for criteria ${JSON.stringify(criteria)}:`, err.message);
  }
};
