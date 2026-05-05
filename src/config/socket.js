const { Server } = require("socket.io");

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                process.env.CLIENT_URL || "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175"
            ],
            credentials: true,
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.on("join_admin_room", () => {
            socket.join("admin_room");
            console.log(`Socket ${socket.id} joined admin_room`);
        });

        socket.on("join_exam_room", (attemptId) => {
            socket.join(`exam_${attemptId}`);
            console.log(`Socket ${socket.id} joined exam room: exam_${attemptId}`);
        });

        socket.on("join_user_room", (userId) => {
            socket.join(`user_${userId}`);
            console.log(`Socket ${socket.id} joined user room: user_${userId}`);
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { initSocket, getIO };
