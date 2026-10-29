const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.get("/", authenticate, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ success: false, message: "Notifications are temporarily unavailable." });
  try {
    const data = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve notifications." });
  }
});
router.patch("/:id/read", authenticate, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid notification ID." });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ success: false, message: "Notifications are temporarily unavailable." });
  try {
    const result = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { read: true }, { new: true });
    if (!result) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.json({ success: true, data: result });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to update this notification." });
  }
});
module.exports = router;
