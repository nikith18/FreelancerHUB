const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const User = require("../models/User");
const { authenticate } = require("../middleware/auth");
const { loginLimiter, registrationLimiter } = require("../middleware/rate-limits");
const { createSessionToken } = require("../utils/session");

const router = express.Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("base64"), 12);
const safeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  profile: user.profile,
  status: user.status,
  verificationStatus: user.verificationStatus,
  createdAt: user.createdAt,
});

function authNotConfigured() {
  return !process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32;
}

function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sendAuthenticated(res, user, status = 200) {
  const token = createSessionToken(user);
  return res.status(status).json({ success: true, data: { user: safeUser(user), token } });
}

router.post("/register", registrationLimiter, async (req, res) => {
  if (authNotConfigured()) return res.status(503).json({ success: false, message: "Authentication is not configured on this server." });
  const { name, email, password, role } = req.body || {};
  const validPassword = typeof password === "string" && password.length >= 10 && password.length <= 128 && Buffer.byteLength(password, "utf8") <= 72;
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80 || !validEmail(email) || !validPassword || !["client", "freelancer"].includes(role)) {
    return res.status(400).json({ success: false, message: "Provide a valid name and email, a password of 10–72 UTF-8 bytes, and choose Client or Freelancer." });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
    return sendAuthenticated(res, user, 201);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: "Unable to register with those details." });
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ success: false, message: "Unable to register with those details." });
    if (error.message?.includes("JWT_SECRET")) return res.status(503).json({ success: false, message: "Authentication is not configured on this server." });
    console.error("Registration failed.");
    return res.status(500).json({ success: false, message: "Unable to create your account right now." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  if (authNotConfigured()) return res.status(503).json({ success: false, message: "Authentication is not configured on this server." });
  const { email, password } = req.body || {};
  if (!validEmail(email) || typeof password !== "string" || password.length > 128 || Buffer.byteLength(password, "utf8") > 1024) {
    return res.status(400).json({ success: false, message: "Enter a valid email and password." });
  }
  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || user.status !== "active" || !passwordMatches) return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    return sendAuthenticated(res, user);
  } catch (error) {
    console.error("Login failed.");
    return res.status(503).json({ success: false, message: "Sign-in services are temporarily unavailable." });
  }
});

router.post("/logout", authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { sessionVersion: 1 } }, { new: true });
    return res.json({ success: true, message: "You have been signed out." });
  } catch {
    console.error("Session revocation failed.");
    return res.status(503).json({ success: false, message: "Sign-out services are temporarily unavailable. Please retry." });
  }
});

router.get("/me", authenticate, (req, res) => res.json({ success: true, data: safeUser(req.user) }));

module.exports = router;
