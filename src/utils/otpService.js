const User = require("../models/User");
const { redis } = require("../config/redis");

/**
 * Generates and sends a mock OTP, verifying the user does not already exist
 */
exports.generateAndSendOTP = async (contact, type) => {
  // 1. Check if user already exists
  if (type === "email") {
    const existingEmail = await User.findOne({ email: contact });
    if (existingEmail) {
      throw new Error("This email is already registered");
    }
  } else if (type === "phone") {
    const existingPhone = await User.findOne({ "studentDetails.studentContact": contact });
    if (existingPhone) {
      throw new Error("This phone number is already registered");
    }
  }

  // 2. Generate generic 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // 3. Store in Redis
  // Key format: otp:email:johndoe@gmail.com
  const redisKey = `otp:${type}:${contact}`;
  await redis.set(redisKey, otp, "EX", 300); // 5 mins expiration

  // 4. Simulate sending OTP via console to avoid latency
  console.log(`\n================================`);
  console.log(`[SIMULATED] OTP for ${contact} (${type})`);
  console.log(`YOUR OTP IS: >>> ${otp} <<<`);
  console.log(`================================\n`);

  return { message: `OTP sent successfully to ${contact}` };
};

/**
 * Validates the OTP against Redis
 */
exports.verifyOTP = async (contact, type, submittedOtp) => {
  const redisKey = `otp:${type}:${contact}`;
  const storedOtp = await redis.get(redisKey);

  if (!storedOtp) {
    throw new Error("OTP expired or not requested");
  }

  if (storedOtp !== submittedOtp.toString()) {
    throw new Error("Invalid OTP");
  }

  // Remove the OTP so it can't be reused
  await redis.del(redisKey);

  // Mark the contact as verified in Redis for 1 hour
  // This token lets the user finalize their registration form
  const verifiedKey = `verified:${type}:${contact}`;
  await redis.set(verifiedKey, "true", "EX", 3600); 

  return { message: `${type} verified successfully` };
};
