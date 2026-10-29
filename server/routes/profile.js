const express = require("express");
const mongoose = require("mongoose");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.put("/me", authenticate, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ success: false, message: "Profile services are temporarily unavailable." });
  const { name, profile } = req.body || {};
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80)) return res.status(400).json({ success: false, message: "Name must be between 2 and 80 characters." });
  if (profile !== undefined && (!profile || typeof profile !== "object" || Array.isArray(profile))) return res.status(400).json({ success: false, message: "Profile must be an object." });
  const fields = ["headline", "bio", "skills", "portfolio", "location"];
  if (profile && Object.keys(profile).some((key) => !fields.includes(key))) return res.status(400).json({ success: false, message: "Profile contains an unsupported field." });
  if (profile?.skills !== undefined && (!Array.isArray(profile.skills) || profile.skills.length > 30 || profile.skills.some((value) => typeof value !== "string" || !value.trim() || value.length > 40))) return res.status(400).json({ success: false, message: "Add up to 30 valid skills." });
  if (profile?.portfolio !== undefined && (!Array.isArray(profile.portfolio) || profile.portfolio.length > 10 || profile.portfolio.some((value) => typeof value !== "string" || value.length > 500 || (value && !/^https?:\/\//i.test(value))))) return res.status(400).json({ success: false, message: "Portfolio links must be valid http or https URLs." });
  if (profile && ["headline", "bio", "location"].some((key) => profile[key] !== undefined && (typeof profile[key] !== "string" || profile[key].length > ({ headline: 120, bio: 2000, location: 100 }[key])))) return res.status(400).json({ success: false, message: "A profile field exceeds its allowed length." });
  try {
    if (name !== undefined) req.user.name = name.trim();
    if (profile) for (const [key, value] of Object.entries(profile)) req.user.set(`profile.${key}`, Array.isArray(value) ? value.map((item) => item.trim()) : value.trim());
    await req.user.save();
    return res.json({ success: true, data: { _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, profile: req.user.profile, verificationStatus: req.user.verificationStatus } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to save your profile." });
  }
});

module.exports = router;
