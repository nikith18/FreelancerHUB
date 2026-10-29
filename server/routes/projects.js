const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const { authenticate, allowRoles } = require("../middleware/auth");
const notify = require("../utils/notify");

const router = express.Router();
const dbUnavailable = (res) => res.status(503).json({ success: false, message: "Projects are temporarily unavailable because the database is disconnected." });

router.get("/my", authenticate, allowRoles("client", "freelancer"), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const ownerField = req.user.role === "client" ? "client" : "freelancer";
    const data = await Project.find({ [ownerField]: req.user._id }).sort({ updatedAt: -1 }).limit(100).populate("job", "title budget currency").populate("client", "name").populate("freelancer", "name profile.headline").lean();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve projects." });
  }
});

router.post("/:id/submit", authenticate, allowRoles("freelancer"), async (req, res) => {
  const { submission } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || typeof submission !== "string" || submission.trim().length < 10 || submission.trim().length > 4000) return res.status(400).json({ success: false, message: "Provide a work summary of at least 10 characters." });
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const project = await Project.findOneAndUpdate({ _id: req.params.id, freelancer: req.user._id, status: { $in: ["active", "revision_requested"] } }, { status: "submitted", submission: submission.trim(), reviewNote: "" }, { new: true }).populate("job", "title");
    if (!project) return res.status(404).json({ success: false, message: "Active project not found." });
    await notify(project.client, "work_submitted", `${req.user.name} submitted work for “${project.job.title}”.`, project._id);
    return res.json({ success: true, data: project });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to submit your work." });
  }
});

router.post("/:id/review", authenticate, allowRoles("client"), async (req, res) => {
  const { decision, note = "" } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !["approve", "revision"].includes(decision) || typeof note !== "string" || note.length > 2000) return res.status(400).json({ success: false, message: "Choose approve or request revision and provide a valid note." });
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const project = await Project.findOneAndUpdate({ _id: req.params.id, client: req.user._id, status: "submitted" }, { status: decision === "approve" ? "completed" : "revision_requested", reviewNote: note.trim() }, { new: true }).populate("job", "title").populate("freelancer", "name");
    if (!project) return res.status(404).json({ success: false, message: "Submitted project not found." });
    await notify(project.freelancer._id, decision === "approve" ? "project_completed" : "revision_requested", decision === "approve" ? `Your work for “${project.job.title}” was approved.` : `A revision was requested for “${project.job.title}”.`, project._id);
    return res.json({ success: true, data: project });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to review this submission." });
  }
});

module.exports = router;
