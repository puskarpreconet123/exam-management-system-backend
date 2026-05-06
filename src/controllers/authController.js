const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Referral = require("../models/Referral");
const { redis } = require("../config/redis");
const otpService = require("../utils/otpService");
const notificationService = require("../services/notificationService");

// ================= SEND OTP =================
exports.sendOtp = async (req, res) => {
  try {
    const { contact, type } = req.body;
    if (!contact || !['email', 'phone'].includes(type)) {
      return res.status(400).json({ message: "Invalid contact or type" });
    }

    await otpService.generateAndSendOTP(contact, type);
    res.status(200).json({ message: `OTP sent to ${contact}` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ================= VERIFY OTP =================
exports.verifyOtp = async (req, res) => {
  try {
    const { contact, type, otp } = req.body;
    if (!contact || !type || !otp) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await otpService.verifyOTP(contact, type, otp);
    res.status(200).json({ message: "Verified successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ================= VERIFY REFERRAL =================
exports.verifyReferral = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Referral code is required" });

    const referral = await Referral.findOne({ code: code.toUpperCase() });
    if (!referral) return res.status(404).json({ message: "Invalid referral code" });
    if (!referral.isActive) return res.status(400).json({ message: "Referral code is no longer active" });

    res.status(200).json({ 
      message: "Referral code is valid", 
      schoolName: referral.schoolName,
      referralMessage: referral.message 
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ================= REGISTER =================
exports.register = async (req, res) => {
  try {
    const {
      studentName, dob, board, schoolName, className, studentContact, email, password,
      guardianName, guardianContact, guardianEmail,
      country, state, district, customState, customDistrict, locality, pin,
      referralCode, paymentType, transactionId
    } = req.body;

    if (!studentName || !email || !password || !studentContact) {
      return res.status(400).json({ message: "Core student fields are required" });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) return res.status(400).json({ message: "Email already registered" });

    const existingPhone = await User.findOne({ "studentDetails.studentContact": studentContact });
    if (existingPhone) return res.status(400).json({ message: "Phone number already registered" });

    // Validate OTPs were verified
    const isEmailVerified = await redis.get(`verified:email:${email}`);
    const isPhoneVerified = await redis.get(`verified:phone:${studentContact}`);

    if (!isEmailVerified || !isPhoneVerified) {
      // Returning error directly since we are enforcing verified OTPs
      // Disable this logic temporarily if strictly testing without UI sending OTP payload
      return res.status(400).json({ message: "You must verify both email and mobile via OTP before registering" });
    }

    let finalPaymentStatus = 'pending';
    let finalTxnId = null;
    let usedReferral = null;

    // Referral logic
    if (referralCode) {
      const validReferral = await Referral.findOne({ code: referralCode.toUpperCase(), isActive: true });
      if (validReferral) {
        usedReferral = validReferral.code;
        if (validReferral.paymentType === 'offline') {
          finalPaymentStatus = 'completed';
          finalTxnId = validReferral.code;
        } else {
          // It's 'online', so follow normal payment options
          if (paymentType === 'pay_now' && transactionId) {
            finalPaymentStatus = 'completed';
            finalTxnId = transactionId;
          }
        }
      } else {
        return res.status(400).json({ message: "Invalid or inactive referral code provided" });
      }
    } else {
      // Normal payment calculation
      if (paymentType === 'pay_now' && transactionId) {
        finalPaymentStatus = 'completed';
        finalTxnId = transactionId;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: studentName,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      studentDetails: { dob, board, schoolName, className, studentContact },
      guardianDetails: { guardianName, guardianContact, guardianEmail },
      address: { country, state, customState, district, customDistrict, locality, pin },
      paymentStatus: finalPaymentStatus,
      transactionId: finalTxnId,
      usedReferralCode: usedReferral,
      emailVerified: !!isEmailVerified,
      phoneVerified: !!isPhoneVerified
    });

    res.status(201).json({
      message: "Registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        paymentStatus: user.paymentStatus,
        usedReferralCode: user.usedReferralCode
      }
    });

    // ✨ Welcome Notification
    await notificationService.notifyUser(
      user._id,
      "Welcome!",
      `Hello ${user.name}, welcome to the ${process.env.APP_TITLE || 'Exam Portal'}!`,
      "success"
    );

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    let { email, password, rememberMe } = req.body;

    // 🛡️ Handle email sent as object
    if (email && typeof email === "object") {
      email = email.email;
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const authError = { message: "Invalid email or password" };

    // 🔎 Find user
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) return res.status(400).json(authError);

    // 🔑 Check password
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json(authError);

    // 🔐 Generate new sessionId
    const sessionId = crypto.randomUUID();

    const userSessionKey = `user_session:${user._id}`;
    const sessionKey = `session:${sessionId}`;

    // ==============================
    // 🚫 AUTO LOGOUT PREVIOUS DEVICE
    // ==============================

    // 1️⃣ Check if old session exists
    const oldSessionId = await redis.get(userSessionKey);

    if (oldSessionId) {
      // 2️⃣ Delete old session
      await redis.del(`session:${oldSessionId}`);
    }

    const sessionDuration = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60 * 24;
    const jwtDuration = rememberMe ? "7d" : "1d";

    // 3️⃣ Save new session mapping (user → sessionId)
    await redis.set(userSessionKey, sessionId, "EX", sessionDuration); 

    // 4️⃣ Save session data (sessionId → user info)
    await redis.set(
      sessionKey,
      JSON.stringify({
        userId: user._id,
        role: user.role,
      }),
      "EX",
      sessionDuration
    );

    // ==============================
    // 🔑 Generate JWT
    // ==============================

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        sessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtDuration }
    );

    // ==============================
    // ✅ Send Response
    // ==============================

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        paymentStatus: user.paymentStatus,
      },
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ================= LOGOUT =================
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;

    await redis.del(`user_session:${userId}`);

    res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= FORGOT PASSWORD =================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // For security, don't reveal if user exists
      return res.status(200).json({ message: "If an account with that email exists, we have sent a reset link." });
    }

    // Generate token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Save to user
    user.resetPasswordToken = resetPasswordToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Simulated Reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

    console.log(`\n================================`);
    console.log(`[SIMULATED] Password Reset for ${email}`);
    console.log(`RESET URL: >>> ${resetUrl} <<<`);
    console.log(`================================\n`);

    res.status(200).json({ message: "If an account with that email exists, we have sent a reset link." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: "Missing required fields" });

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};