const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  sessionVersion: { type: Number, min: 0, default: 0 },
  role: { type: String, enum: ["admin", "client", "freelancer"], required: true },
  profile: {
    headline: { type: String, trim: true, maxlength: 120, default: "" },
    bio: { type: String, trim: true, maxlength: 2000, default: "" },
    skills: { type: [String], default: [] },
    portfolio: { type: [String], default: [] },
    location: { type: String, trim: true, maxlength: 100, default: "" },
  },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  verificationStatus: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified" },
}, { timestamps: true });

userSchema.index({ role: 1, status: 1 });
module.exports = mongoose.model("User", userSchema);
