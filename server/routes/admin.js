const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Job = require("../models/Job");
const Application = require("../models/Application");
const notify = require("../utils/notify");
const Project = require("../models/Project");
const { authenticate, allowRoles } = require("../middleware/auth");
const { parsePageParams } = require("../utils/pagination");
const { recordAdminAction } = require("../utils/security-audit");

const router = express.Router();
router.use(authenticate, allowRoles("admin"));
router.use((req, res, next) => mongoose.connection.readyState === 1
  ? next()
  : res.status(503).json({ success: false, message: "Administrative services are temporarily unavailable." }));

router.get("/stats", async (req, res) => {
  try {
    const [users, clients, freelancers, jobs, openJobs, applications, projects, activeProjects] = await Promise.all([
      User.countDocuments(), User.countDocuments({ role: "client" }), User.countDocuments({ role: "freelancer" }), Job.countDocuments(), Job.countDocuments({ status: "open" }), Application.countDocuments(), Project.countDocuments(), Project.countDocuments({ status: "active" }),
    ]);
    return res.json({ success: true, data: { users, clients, freelancers, jobs, openJobs, applications, projects, activeProjects } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve admin statistics." });
  }
});

router.get("/users", async (req, res) => {
  const pagination = parsePageParams(req.query, { defaultLimit: 20, maxLimit: 50 });
  if (!pagination) return res.status(400).json({ success: false, message: "Page or limit is outside the allowed range." });
  const { page, limit } = pagination;
  const filter = {};
  if (["client", "freelancer", "admin"].includes(req.query.role)) filter.role = req.query.role;
  if (["active", "suspended"].includes(req.query.status)) filter.status = req.query.status;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";
  if (search) {
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: safeSearch, $options: "i" } }, { email: { $regex: safeSearch, $options: "i" } }];
  }
  try {
    const [data, total] = await Promise.all([User.find(filter).select("name email role status verificationStatus createdAt profile.headline").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
    return res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to search users." });
  }
});

router.patch("/users/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid user ID." });
  const { status } = req.body || {};
  if (status === undefined || !["active", "suspended"].includes(status)) return res.status(400).json({ success: false, message: "Choose active or suspended account status." });
  if (req.params.id === req.user._id.toString()) return res.status(400).json({ success: false, message: "You cannot change your own admin account here." });
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).select("name email role status verificationStatus");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    recordAdminAction(req, status === "suspended" ? "user.suspend" : "user.activate", "user", user._id);
    return res.json({ success: true, data: user });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to update this account." });
  }
});

router.get("/jobs", async (req, res) => {
  const status = ["open", "closed", "removed"].includes(req.query.status) ? req.query.status : undefined;
  try {
    const data = await Job.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(100).populate("client", "name email").lean();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve jobs for moderation." });
  }
});

router.get("/applications", async (req, res) => {
  try {
    const data = await Application.find().sort({ createdAt: -1 }).limit(100).populate("job", "title status client").populate("freelancer", "name").lean();
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve proposals for moderation." });
  }
});

router.patch("/applications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid proposal ID." });
  if (req.body?.status !== "withdrawn") return res.status(400).json({ success: false, message: "Moderation may withdraw a pending proposal." });
  try {
    const application = await Application.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { status: "withdrawn" }, { new: true });
    if (!application) return res.status(404).json({ success: false, message: "Pending proposal not found." });
    recordAdminAction(req, "application.withdraw", "application", application._id);
    await notify(application.freelancer, "proposal_moderated", "An administrator withdrew a proposal after review.", application._id);
    return res.json({ success: true, data: application });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to moderate this proposal." });
  }
});

router.patch("/jobs/:id", async (req, res) => {
  const { status } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  if (!["open", "closed", "removed"].includes(status)) return res.status(400).json({ success: false, message: "Choose open, closed or removed." });
  try {
    if (status === "open" && await Application.exists({ job: req.params.id, status: "accepted" })) return res.status(409).json({ success: false, message: "A job with an accepted proposal cannot be reopened." });
    const job = await Job.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ success: false, message: "Job not found." });
    recordAdminAction(req, `job.${status}`, "job", job._id);
    return res.json({ success: true, data: job });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to moderate this job." });
  }
});

module.exports = router;
