const Referral = require("../../models/Referral");

exports.createReferral = async (req, res) => {
  try {
    const { code, schoolName, paymentType } = req.body;
    
    if (!code || !schoolName || !paymentType) {
      return res.status(400).json({ message: "Referral code, school name, and payment type are required" });
    }

    // Check if code already exists
    const existingRef = await Referral.findOne({ code: code.toUpperCase() });
    if (existingRef) {
      return res.status(400).json({ message: "Referral code already exists" });
    }

    // Create new referral code
    const newReferral = new Referral({
      code: code.toUpperCase(),
      schoolName: schoolName.trim(),
      paymentType,
      createdBy: req.user.id, // Auth middleware typically sets req.user.id
      isActive: true
    });

    await newReferral.save();

    res.status(201).json({ 
      message: "Referral code created successfully", 
      referral: newReferral 
    });
  } catch (error) {
    console.error("Error creating referral:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getReferrals = async (req, res) => {
  try {
    const referrals = await Referral.find().sort({ createdAt: -1 });
    res.status(200).json({ referrals });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.toggleReferralStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const referral = await Referral.findById(id);

    if (!referral) {
      return res.status(404).json({ message: "Referral not found" });
    }

    referral.isActive = !referral.isActive;
    await referral.save();

    res.status(200).json({ 
      message: `Referral code ${referral.isActive ? 'activated' : 'deactivated'} successfully`, 
      referral 
    });
  } catch (error) {
    console.error("Error toggling referral status:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
