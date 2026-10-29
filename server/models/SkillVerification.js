const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema({
  type: { type: String, enum: ["github", "live_demo", "portfolio", "written_explanation"], required: true },
  url: { type: String, default: "", maxlength: 2048 },
  description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
  submittedAt: { type: Date, required: true, default: Date.now },
}, { _id: true });

const reviewEventSchema = new mongoose.Schema({
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  decision: { type: String, enum: ["approved", "rejected", "more_info", "flagged"], required: true },
  reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
  evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt: { type: Date, required: true, default: Date.now },
}, { _id: true });

const withdrawalSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  withdrawnAt: { type: Date, required: true, default: Date.now },
}, { _id: true });

const skillVerificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  skillName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  skillKey: { type: String, required: true, trim: true, maxlength: 60 },
  status: { type: String, enum: ["claimed", "evidence_submitted", "reviewed", "verified", "rejected"], default: "claimed", required: true },
  evidenceType: { type: String, enum: ["github", "live_demo", "portfolio", "written_explanation"], default: null },
  evidenceUrl: { type: String, default: "", maxlength: 2048 },
  evidenceDescription: { type: String, default: "", maxlength: 2000 },
  submittedAt: { type: Date, default: null },
  evidenceHistory: { type: [evidenceSchema], default: [] },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewDecision: { type: String, enum: ["approved", "rejected", "more_info", "flagged", null], default: null },
  reviewFeedback: { type: String, default: "", maxlength: 1000 },
  reviewedAt: { type: Date, default: null },
  reviewHistory: { type: [reviewEventSchema], default: [] },
  withdrawalHistory: { type: [withdrawalSchema], default: [] },
  flaggedAt: { type: Date, default: null },
  flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  flagReason: { type: String, default: "", maxlength: 1000 },
}, { timestamps: true });

skillVerificationSchema.index({ user: 1, skillKey: 1 }, { unique: true });
skillVerificationSchema.index({ user: 1, updatedAt: -1 });
skillVerificationSchema.index({ user: 1, status: 1 });
skillVerificationSchema.index({ status: 1, submittedAt: -1 });
skillVerificationSchema.index({ skillKey: 1, status: 1 });

module.exports = mongoose.model("SkillVerification", skillVerificationSchema);
