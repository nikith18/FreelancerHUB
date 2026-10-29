const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },
  proposedBudget: { type: Number, required: true, min: 1, max: 100000000 },
  duration: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ["pending", "accepted", "rejected", "withdrawn"], default: "pending" },
}, { timestamps: true });

applicationSchema.index({ job: 1, freelancer: 1 }, { unique: true });
applicationSchema.index({ freelancer: 1, status: 1 });
module.exports = mongoose.model("Application", applicationSchema);
