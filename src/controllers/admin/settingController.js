const SystemSetting = require("../../models/SystemSetting");
const actionLogService = require("../../services/actionLogService");

exports.getSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.find();
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    res.status(200).json(settingsMap);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body; // { registrationAmount: 500, razorpayKeyId: '...', ... }
    
    const promises = Object.entries(updates).map(async ([key, value]) => {
      return SystemSetting.findOneAndUpdate(
        { key },
        { value, updatedBy: req.user.id },
        { upsert: true, new: true }
      );
    });

    await Promise.all(promises);

    // Log the action
    await actionLogService.logAction(
      req.user.id,
      "UPDATE_SETTINGS",
      "SYSTEM",
      null,
      { updates: Object.keys(updates) },
      req
    );

    res.status(200).json({ message: "Settings updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPublicSettings = async (req, res) => {
  try {
    // Only return settings that are safe for public (students)
    const keys = ["registrationAmount", "razorpayKeyId"];
    const settings = await SystemSetting.find({ key: { $in: keys } });
    
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    // Fallback to env if not in DB
    if (settingsMap.registrationAmount === undefined) {
        settingsMap.registrationAmount = process.env.DEFAULT_REGISTRATION_AMOUNT || 0;
    }
    if (settingsMap.razorpayKeyId === undefined) {
        settingsMap.razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    }

    res.status(200).json(settingsMap);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
