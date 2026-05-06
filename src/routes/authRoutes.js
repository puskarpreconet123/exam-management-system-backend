const router = require("express").Router();
const auth = require("../middleware/auth");
const verifyCaptcha = require("../middleware/verifyCaptcha");
const {
  register,
  login,
  logout,
  sendOtp,
  verifyOtp,
  verifyReferral,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const settingCtrl = require("../controllers/admin/settingController");

router.get("/settings", settingCtrl.getPublicSettings);
router.post(
  "/register",
  verifyCaptcha({ minScore: 0.5, expectedAction: "register" }),
  register
);
router.post("/verify-referral", verifyReferral);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post(
  "/login",
  verifyCaptcha({ minScore: 0.5, expectedAction: "login" }),
  login
);
router.post("/logout", auth, logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;