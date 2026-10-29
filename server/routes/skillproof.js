const express = require("express");
const mongoose = require("mongoose");
const SkillVerification = require("../models/SkillVerification");
const User = require("../models/User");
const { authenticate, allowRoles } = require("../middleware/auth");
const { parsePageParams } = require("../utils/pagination");
const { recordAdminAction } = require("../utils/security-audit");

const router = express.Router();
const STATUSES = ["claimed", "evidence_submitted", "reviewed", "verified", "rejected"];
const EVIDENCE_TYPES = ["github", "live_demo", "portfolio", "written_explanation"];
const dbReady = (res) => mongoose.connection.readyState === 1 || res.status(503).json({ success: false, message: "SkillProof is temporarily unavailable because the database is disconnected." });
const safeSkillName = (value) => typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 60 && /^[\p{L}\p{N}][\p{L}\p{N} .+#&\/-]*$/u.test(value.trim());
const normalizeSkill = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function safeHttpUrl(value, required) {
  if (value === undefined || value === "") return required ? null : "";
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

function invalidId(value) { return !mongoose.isValidObjectId(value); }
function validReason(value) { return typeof value === "string" && value.trim().length >= 5 && value.trim().length <= 1000; }

router.get("/mine", authenticate, allowRoles("freelancer"), async (req, res) => {
  if (!dbReady(res)) return;
  try {
    const records = await SkillVerification.find({ user: req.user._id }).populate("reviewer", "name").populate("reviewHistory.reviewer", "name").sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: records });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve your SkillProof records." });
  }
});

router.post("/mine", authenticate, allowRoles("freelancer"), async (req, res) => {
  if (!dbReady(res)) return;
  const { skillName } = req.body || {};
  if (!safeSkillName(skillName)) return res.status(400).json({ success: false, message: "Skill names must be 2–60 characters and use letters, numbers, spaces, or . + # & / - symbols." });
  try {
    const record = await SkillVerification.create({ user: req.user._id, skillName: skillName.trim(), skillKey: normalizeSkill(skillName) });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "You already have a SkillProof claim for that skill." });
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Skill claim is invalid." });
    return res.status(500).json({ success: false, message: "Unable to create the skill claim." });
  }
});

router.get("/public/:userId", async (req, res) => {
  if (invalidId(req.params.userId)) return res.status(400).json({ success: false, message: "Invalid freelancer ID." });
  if (!dbReady(res)) return;
  try {
    const user = await User.findOne({ _id: req.params.userId, role: "freelancer", status: "active" }).select("_id").lean();
    if (!user) return res.status(404).json({ success: false, message: "Freelancer profile not found." });
    const data = await SkillVerification.find({ user: user._id, status: "verified" })
      .select("skillName evidenceType reviewedAt")
      .sort({ skillName: 1 }).lean();
    return res.json({ success: true, data: data.map(({ skillName, evidenceType, reviewedAt }) => ({ skillName, evidenceType, verifiedAt: reviewedAt })) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve verified skills." });
  }
});

router.get("/admin", authenticate, allowRoles("admin"), async (req, res) => {
  if (!dbReady(res)) return;
  const pagination = parsePageParams(req.query, { defaultLimit: 20, maxLimit: 50 });
  if (!pagination) return res.status(400).json({ success: false, message: "Page or limit is outside the allowed range." });
  const { status = "evidence_submitted", skill, from, to } = req.query;
  if (typeof status !== "string" || !STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Choose a valid SkillProof status." });
  if (skill !== undefined && (typeof skill !== "string" || skill.length > 60)) return res.status(400).json({ success: false, message: "Skill filter is too long." });
  if ([from, to].some((value) => value !== undefined && !validDate(value))) return res.status(400).json({ success: false, message: "Use valid YYYY-MM-DD dates for the date filters." });
  if (from && to && from > to) return res.status(400).json({ success: false, message: "The start date must not be after the end date." });
  const filter = { status };
  if (skill?.trim()) filter.skillKey = normalizeSkill(skill);
  if (from || to) {
    filter.submittedAt = {};
    if (from) filter.submittedAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.submittedAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  try {
    const [records, total] = await Promise.all([
      SkillVerification.find(filter).populate("user", "name profile.headline profile.location profile.skills")
        .populate("reviewer", "name").sort({ submittedAt: -1, createdAt: -1 })
        .skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      SkillVerification.countDocuments(filter),
    ]);
    return res.json({ success: true, data: records, pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve SkillProof reviews." });
  }
});

router.get("/admin/:id", authenticate, allowRoles("admin"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  try {
    const record = await SkillVerification.findById(req.params.id)
      .populate("user", "name profile.headline profile.bio profile.location profile.skills")
      .populate("reviewer", "name").populate("reviewHistory.reviewer", "name").lean();
    if (!record) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    return res.json({ success: true, data: record });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve this SkillProof record." });
  }
});

router.get("/:id", authenticate, allowRoles("freelancer", "admin"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  try {
    const record = await SkillVerification.findById(req.params.id).populate("reviewer", "name").populate("reviewHistory.reviewer", "name").lean();
    if (!record || (req.user.role !== "admin" && record.user.toString() !== req.user._id.toString())) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    return res.json({ success: true, data: record });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve this SkillProof record." });
  }
});

router.post("/:id/evidence", authenticate, allowRoles("freelancer"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  const { type, url = "", description } = req.body || {};
  if (!EVIDENCE_TYPES.includes(type) || typeof description !== "string" || description.trim().length < 20 || description.trim().length > 2000) return res.status(400).json({ success: false, message: "Choose an evidence type and provide an explanation of 20–2,000 characters." });
  const safeUrl = safeHttpUrl(url, type !== "written_explanation");
  if (safeUrl === null) return res.status(400).json({ success: false, message: "Evidence links must be valid HTTP or HTTPS URLs without credentials." });
  try {
    const record = await SkillVerification.findOne({ _id: req.params.id, user: req.user._id });
    if (!record) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    if (!["claimed", "rejected", "reviewed"].includes(record.status)) return res.status(409).json({ success: false, message: "Evidence can only be submitted for a claim, rejected record, or request for more information." });
    const submission = { type, url: safeUrl, description: description.trim(), submittedAt: new Date() };
    const updated = await SkillVerification.findOneAndUpdate(
      { _id: record._id, user: req.user._id, status: record.status },
      { $set: { status: "evidence_submitted", evidenceType: type, evidenceUrl: safeUrl, evidenceDescription: submission.description, submittedAt: submission.submittedAt, reviewer: null, reviewDecision: null, reviewFeedback: "", reviewedAt: null }, $push: { evidenceHistory: submission } },
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(409).json({ success: false, message: "This claim changed while you were submitting evidence. Refresh and try again." });
    return res.status(201).json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to submit evidence." });
  }
});

router.post("/:id/withdraw", authenticate, allowRoles("freelancer"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  try {
    const snapshot = await SkillVerification.findOne({ _id: req.params.id, user: req.user._id }).select("status evidenceHistory submittedAt").lean();
    if (!snapshot) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    if (snapshot.status !== "evidence_submitted") return res.status(409).json({ success: false, message: "Only a pending submission can be withdrawn." });
    const record = await SkillVerification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: "evidence_submitted", submittedAt: snapshot.submittedAt },
      { $set: { status: "claimed" }, $push: { withdrawalHistory: { actor: req.user._id, evidenceId: snapshot.evidenceHistory.at(-1)?._id || null, withdrawnAt: new Date() } } },
      { new: true, runValidators: true },
    );
    if (!record) return res.status(409).json({ success: false, message: "This submission changed while you were withdrawing it. Refresh and try again." });
    return res.json({ success: true, data: record });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to withdraw this submission." });
  }
});

router.patch("/admin/:id/review", authenticate, allowRoles("admin"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  const { decision, reason } = req.body || {};
  const statuses = { approve: "verified", reject: "rejected", more_info: "reviewed" };
  if (!statuses[decision] || !validReason(reason)) return res.status(400).json({ success: false, message: "Choose approve, reject, or more_info and provide a reason of 5–1,000 characters." });
  try {
    const snapshot = await SkillVerification.findById(req.params.id).select("evidenceHistory submittedAt").lean();
    if (!snapshot) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    const latestEvidence = snapshot.evidenceHistory.at(-1)?._id || null;
    const reviewedAt = new Date();
    const record = await SkillVerification.findOneAndUpdate(
      { _id: req.params.id, status: "evidence_submitted", submittedAt: snapshot.submittedAt },
      { $set: { status: statuses[decision], reviewer: req.user._id, reviewDecision: decision, reviewFeedback: reason.trim(), reviewedAt }, $push: { reviewHistory: { reviewer: req.user._id, decision: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "more_info", reason: reason.trim(), evidenceId: latestEvidence, decidedAt: reviewedAt } } },
      { new: true, runValidators: true },
    );
    if (!record) return res.status(409).json({ success: false, message: "This submission has already been reviewed. Refresh the queue." });
    recordAdminAction(req, `skillproof.${decision}`, "skill_verification", record._id);
    return res.json({ success: true, data: record });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to save this review decision." });
  }
});

router.patch("/admin/:id/flag", authenticate, allowRoles("admin"), async (req, res) => {
  if (invalidId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SkillProof ID." });
  if (!dbReady(res)) return;
  const { reason } = req.body || {};
  if (!validReason(reason)) return res.status(400).json({ success: false, message: "Provide a review flag reason of 5–1,000 characters." });
  try {
    const snapshot = await SkillVerification.findById(req.params.id).select("evidenceHistory submittedAt").lean();
    if (!snapshot) return res.status(404).json({ success: false, message: "SkillProof record not found." });
    const flaggedAt = new Date();
    const record = await SkillVerification.findOneAndUpdate(
      { _id: req.params.id, status: "evidence_submitted", submittedAt: snapshot.submittedAt },
      { $set: { flaggedAt, flaggedBy: req.user._id, flagReason: reason.trim() }, $push: { reviewHistory: { reviewer: req.user._id, decision: "flagged", reason: reason.trim(), evidenceId: snapshot.evidenceHistory.at(-1)?._id || null, decidedAt: flaggedAt } } },
      { new: true, runValidators: true },
    );
    if (!record) return res.status(409).json({ success: false, message: "Only a pending submission can be flagged." });
    recordAdminAction(req, "skillproof.flag", "skill_verification", record._id);
    return res.json({ success: true, data: record });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to flag this submission." });
  }
});

module.exports = router;
