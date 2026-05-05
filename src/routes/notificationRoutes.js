const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const auth = require("../middleware/auth");

// All routes are protected
router.use(auth);

router.get("/", notificationController.getNotifications);
router.post("/", notificationController.createNotification);
router.delete("/clear-all", notificationController.clearAll);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);


module.exports = router;
