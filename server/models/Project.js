const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true, unique: true },
  status: { type: String, enum: ["active", "submitted", "revision_requested", "completed", "cancelled"], default: "active" },
  deadline: { type: Date, default: null },
  submission: { type: String, trim: true, maxlength: 4000, default: "" },
  reviewNote: { type: String, trim: true, maxlength: 2000, default: "" },
  paymentStatus: { type: String, enum: ["not_started", "pending", "paid", "disputed"], default: "not_started" },
}, { timestamps: true });

projectSchema.index({ client: 1, status: 1 });
projectSchema.index({ freelancer: 1, status: 1 });
module.exports = mongoose.model("Project", projectSchema);
