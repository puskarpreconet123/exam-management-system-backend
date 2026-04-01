const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  register,
  login,
  logout,
  sendOtp,
  verifyOtp,
  verifyReferral,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/verify-referral", verifyReferral);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/logout", auth, logout);

module.exports = router;