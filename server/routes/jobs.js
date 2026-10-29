const express = require("express");
const mongoose = require("mongoose");
const Job = require("../models/Job");
const Application = require("../models/Application");
const { authenticate, allowRoles } = require("../middleware/auth");
const { parsePageParams } = require("../utils/pagination");

const router = express.Router();
const MAX_PAGE_SIZE = 50;

function databaseUnavailable(res) {
  return res.status(503).json({ success: false, message: "Job listings are temporarily unavailable because the database is disconnected." });
}

router.get("/", async (req, res) => {
  const { page = "1", limit = "12", search, category, jobType, currency, minBudget, maxBudget, sort = "newest" } = req.query;
  const pagination = parsePageParams(req.query, { defaultLimit: 12, maxLimit: MAX_PAGE_SIZE });
  if (!pagination) return res.status(400).json({ success: false, message: "Page or limit is outside the allowed range." });
  if (jobType !== undefined && !["fixed", "hourly"].includes(jobType)) {
    return res.status(400).json({ success: false, message: "Job type must be fixed or hourly." });
  }
  if (currency !== undefined && (typeof currency !== "string" || !/^[a-zA-Z]{3}$/.test(currency))) {
    return res.status(400).json({ success: false, message: "Currency must be a 3-letter code." });
  }
  const validBudget = (value) => value === undefined || (/^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) >= 0);
  if (!validBudget(minBudget) || !validBudget(maxBudget) || (minBudget !== undefined && maxBudget !== undefined && Number(minBudget) > Number(maxBudget))) {
    return res.status(400).json({ success: false, message: "Budget range must contain valid amounts with minimum no greater than maximum." });
  }
  const sortOptions = {
    newest: { createdAt: -1 },
    "budget-low": { budget: 1, createdAt: -1 },
    "budget-high": { budget: -1, createdAt: -1 },
  };
  if (typeof sort !== "string" || !sortOptions[sort]) {
    return res.status(400).json({ success: false, message: "Sort must be newest, budget-low, or budget-high." });
  }
  if ((minBudget !== undefined || maxBudget !== undefined || sort !== "newest") && !currency) {
    return res.status(400).json({ success: false, message: "Choose a currency when filtering or sorting by budget." });
  }
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);

  const { page: pageNumber, limit: pageSize } = pagination;
  const filter = { status: "open" };
  if (typeof search === "string" && search.trim()) {
    const escapedSearch = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escapedSearch, $options: "i" } },
      { description: { $regex: escapedSearch, $options: "i" } },
      { requiredSkills: { $regex: escapedSearch, $options: "i" } },
    ];
  }
  if (typeof category === "string" && category.trim()) {
    filter.category = category.trim().slice(0, 60);
  }
  if (jobType) filter.jobType = jobType;
  if (currency) filter.currency = currency.toUpperCase();
  if (minBudget !== undefined || maxBudget !== undefined) {
    filter.budget = {};
    if (minBudget !== undefined) filter.budget.$gte = Number(minBudget);
    if (maxBudget !== undefined) filter.budget.$lte = Number(maxBudget);
  }

  try {
    const [jobs, total] = await Promise.all([
      Job.find(filter).sort(sortOptions[sort]).skip((pageNumber - 1) * pageSize).limit(pageSize).lean(),
      Job.countDocuments(filter),
    ]);
    return res.json({ success: true, data: jobs, pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error("Unable to list jobs (database query failed).");
    return res.status(500).json({ success: false, message: "Unable to retrieve jobs." });
  }
});

router.get("/mine", authenticate, allowRoles("client"), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  try {
    const jobs = await Job.find({ client: req.user._id, status: { $ne: "removed" } }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, data: jobs });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve your jobs." });
  }
});

router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid job ID." });
  }
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  try {
    const job = await Job.findOne({ _id: req.params.id, status: "open" }).lean();
    if (!job) return res.status(404).json({ success: false, message: "Job not found." });
    return res.json({ success: true, data: job });
  } catch (error) {
    console.error("Unable to retrieve job (database query failed).");
    return res.status(500).json({ success: false, message: "Unable to retrieve job." });
  }
});

// Development-stage endpoint: public job creation is temporary until client authentication is implemented.
router.post("/", authenticate, allowRoles("client"), async (req, res) => {
  const { title, description, requiredSkills, budget, currency, jobType, category, deadline } = req.body ?? {};
  const invalidSkills = requiredSkills !== undefined && (!Array.isArray(requiredSkills) || requiredSkills.some((skill) => typeof skill !== "string"));
  const invalidDeadline = deadline !== undefined && deadline !== null && (typeof deadline !== "string" || Number.isNaN(Date.parse(deadline)));
  if (typeof title !== "string" || typeof description !== "string" || invalidSkills || invalidDeadline) {
    return res.status(400).json({ success: false, message: "Provide a title, description, skills array, and valid deadline." });
  }
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);

  try {
    const job = await Job.create({ client: req.user._id, title, description, requiredSkills, budget, currency, jobType, category, deadline });
    return res.status(201).json({ success: true, data: job });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Job details are invalid.", errors: Object.values(error.errors ?? {}).map(({ message }) => message) });
    }
    console.error("Unable to create job (database write failed).");
    return res.status(500).json({ success: false, message: "Unable to create job." });
  }
});

router.put("/:id", authenticate, allowRoles("client"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  const allowed = ["title", "description", "requiredSkills", "budget", "currency", "jobType", "category", "deadline", "status"];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(updates).length || Object.keys(req.body || {}).some((key) => !allowed.includes(key))) return res.status(400).json({ success: false, message: "Provide only editable job fields." });
  if (updates.status && !["open", "closed"].includes(updates.status)) return res.status(400).json({ success: false, message: "Job status must be open or closed." });
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  try {
    const hasAcceptedProposal = await Application.exists({ job: req.params.id, status: "accepted" });
    if (hasAcceptedProposal && Object.keys(updates).some((key) => key !== "status")) return res.status(409).json({ success: false, message: "Job details are locked after a proposal is accepted." });
    if (updates.status === "open" && hasAcceptedProposal) return res.status(409).json({ success: false, message: "This job already has an accepted proposal and cannot be reopened." });
    const job = await Job.findOneAndUpdate({ _id: req.params.id, client: req.user._id, status: { $ne: "removed" } }, updates, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ success: false, message: "Job not found." });
    return res.json({ success: true, data: job });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ success: false, message: "Job details are invalid." });
    console.error("Unable to update job (database write failed).");
    return res.status(500).json({ success: false, message: "Unable to update job." });
  }
});

router.delete("/:id", authenticate, allowRoles("client"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  try {
    const job = await Job.findOneAndUpdate({ _id: req.params.id, client: req.user._id, status: { $ne: "removed" } }, { status: "closed" }, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ success: false, message: "Job not found." });
    return res.json({ success: true, data: job, message: "Job closed." });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to close this job." });
  }
});

module.exports = router;
