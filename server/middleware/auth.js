const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const {
  JWT_AUDIENCE,
  JWT_ISSUER,
} = require("../utils/session");

function bearerToken(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

async function authenticate(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ success: false, message: "Sign in to continue." });
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) return res.status(503).json({ success: false, message: "Authentication is not configured." });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ success: false, message: "Your session is invalid or has expired. Sign in again." });
  }

  if (!payload || typeof payload !== "object" || typeof payload.sub !== "string" || !mongoose.isValidObjectId(payload.sub)) {
    return res.status(401).json({ success: false, message: "Your session is invalid or has expired. Sign in again." });
  }

  let user;
  try {
    user = await User.findById(payload.sub);
  } catch {
    console.error("Authentication user lookup failed.");
    return res.status(503).json({ success: false, message: "Sign-in services are temporarily unavailable." });
  }
  if (!user || user.status !== "active") return res.status(401).json({ success: false, message: "This account is unavailable. Sign in again or contact support." });

  const sessionVersion = user.sessionVersion ?? 0;
  if (payload.ver !== sessionVersion) {
    return res.status(401).json({ success: false, message: "Your session is invalid or has expired. Sign in again." });
  }

  req.user = user;
  return next();
}

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ success: false, message: "Your account does not have permission for this action." });
}

module.exports = { authenticate, allowRoles };
