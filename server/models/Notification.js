const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true, maxlength: 60 },
  message: { type: String, required: true, maxlength: 300 },
  relatedResource: { type: mongoose.Schema.Types.ObjectId, default: null },
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
module.exports = mongoose.model("Notification", notificationSchema);
