const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const Job = require("../models/Job");
const Project = require("../models/Project");
const SkillVerification = require("../models/SkillVerification");
const { authenticate, allowRoles } = require("../middleware/auth");
const notify = require("../utils/notify");

const router = express.Router();
const dbUnavailable = (res) => res.status(503).json({ success: false, message: "Applications are temporarily unavailable because the database is disconnected." });

router.post("/", authenticate, allowRoles("freelancer"), async (req, res) => {
  const { jobId, message, proposedBudget, duration } = req.body || {};
  if (!mongoose.isValidObjectId(jobId) || typeof message !== "string" || message.trim().length < 20 || message.trim().length > 3000 || !Number.isFinite(Number(proposedBudget)) || Number(proposedBudget) < 1 || typeof duration !== "string" || !duration.trim() || duration.trim().length > 80) return res.status(400).json({ success: false, message: "Provide a valid job, proposal of at least 20 characters, budget, and estimated duration." });
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const job = await Job.findOne({ _id: jobId, status: "open" });
    if (!job) return res.status(404).json({ success: false, message: "This job is not open for proposals." });
    if (job.client?.equals(req.user._id)) return res.status(403).json({ success: false, message: "You cannot apply to your own job." });
    const application = await Application.create({ job: job._id, freelancer: req.user._id, message: message.trim(), proposedBudget: Number(proposedBudget), duration: duration.trim() });
    await notify(job.client, "application_received", `${req.user.name} sent a proposal for “${job.title}”.`, application._id);
    return res.status(201).json({ success: true, data: application });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "You have already applied to this job." });
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ success: false, message: "Proposal details are invalid." });
    console.error("Unable to submit proposal.");
    return res.status(500).json({ success: false, message: "Unable to submit your proposal right now." });
  }
});

router.get("/my", authenticate, allowRoles("freelancer"), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const data = await Application.find({ freelancer: req.user._id }).sort({ createdAt: -1 }).limit(100).populate("job", "title budget currency status client").lean();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve your proposals." });
  }
});

router.get("/job/:jobId", authenticate, allowRoles("client", "admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const job = await Job.findById(req.params.jobId).select("client");
    if (!job || (req.user.role !== "admin" && !job.client?.equals(req.user._id))) return res.status(404).json({ success: false, message: "Job not found." });
    const data = await Application.find({ job: job._id }).sort({ createdAt: -1 }).populate("freelancer", "name profile verificationStatus").lean();
    const freelancerIds = [...new Set(data.map((application) => application.freelancer?._id?.toString()).filter(Boolean))];
    const verifiedSkills = freelancerIds.length
      ? await SkillVerification.find({ user: { $in: freelancerIds }, status: "verified" }).select("user skillName evidenceType reviewedAt").lean()
      : [];
    const skillsByFreelancer = new Map();
    for (const skill of verifiedSkills) {
      const key = skill.user.toString();
      skillsByFreelancer.set(key, [...(skillsByFreelancer.get(key) || []), { skillName: skill.skillName, evidenceType: skill.evidenceType, verifiedAt: skill.reviewedAt }]);
    }
    for (const application of data) {
      if (application.freelancer) application.freelancer.verifiedSkills = skillsByFreelancer.get(application.freelancer._id.toString()) || [];
    }
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve proposals." });
  }
});

router.post("/:id/:action", authenticate, allowRoles("client"), async (req, res) => {
  const { id, action } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid proposal ID." });
  if (!["accept", "reject"].includes(action)) return res.status(400).json({ success: false, message: "Choose accept or reject." });
  if (mongoose.connection.readyState !== 1) return dbUnavailable(res);
  try {
    const application = await Application.findById(id).populate("job");
    if (!application || !application.job || !application.job.client?.equals(req.user._id)) return res.status(404).json({ success: false, message: "Proposal not found." });
    if (application.status !== "pending") return res.status(409).json({ success: false, message: "This proposal has already been reviewed." });
    if (action === "reject") {
      application.status = "rejected";
      await application.save();
      await notify(application.freelancer, "application_rejected", `Your proposal for “${application.job.title}” was not selected.`, application._id);
      return res.json({ success: true, data: application });
    }
    const lockedJob = await Job.findOneAndUpdate({ _id: application.job._id, client: req.user._id, status: "open" }, { status: "closed" }, { new: true });
    if (!lockedJob) return res.status(409).json({ success: false, message: "This job is already closed or another proposal has been accepted." });
    try {
      const acceptedApplication = await Application.findOneAndUpdate({ _id: application._id, job: lockedJob._id, status: "pending" }, { status: "accepted" }, { new: true });
      if (!acceptedApplication) {
        await Job.updateOne({ _id: lockedJob._id, status: "closed" }, { status: "open" });
        return res.status(409).json({ success: false, message: "This proposal has already been reviewed." });
      }
      await Application.updateMany({ job: lockedJob._id, _id: { $ne: application._id }, status: "pending" }, { status: "rejected" });
      const project = await Project.create({ job: lockedJob._id, client: req.user._id, freelancer: acceptedApplication.freelancer, application: acceptedApplication._id, deadline: lockedJob.deadline, paymentStatus: "pending" });
      await Promise.all([
        notify(acceptedApplication.freelancer, "application_accepted", `Your proposal for “${lockedJob.title}” was accepted.`, project._id),
        notify(req.user._id, "project_started", `A project was started for “${lockedJob.title}”.`, project._id),
      ]);
      return res.json({ success: true, data: { application: acceptedApplication, project } });
    } catch (error) {
      await Application.updateOne({ _id: application._id, status: "accepted" }, { status: "pending" });
      await Application.updateMany({ job: lockedJob._id, status: "rejected" }, { status: "pending" });
      await Job.updateOne({ _id: lockedJob._id, status: "closed" }, { status: "open" });
      throw error;
    }
  } catch (error) {
    console.error("Unable to review proposal.");
    return res.status(500).json({ success: false, message: "Unable to review this proposal right now." });
  }
});

module.exports = router;
