const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const jobsRouter = require("./routes/jobs");
const authRouter = require("./routes/auth");
const applicationsRouter = require("./routes/applications");
const projectsRouter = require("./routes/projects");
const notificationsRouter = require("./routes/notifications");
const profileRouter = require("./routes/profile");
const adminRouter = require("./routes/admin");
const skillProofRouter = require("./routes/skillproof");
const { apiLimiter } = require("./middleware/rate-limits");
const { requireTrustedMutationOrigin } = require("./middleware/csrf");

let databaseConnectionPromise;

function connectForServerlessRequest() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!process.env.MONGODB_URI) return Promise.reject(new Error("MONGODB_URI is missing."));
  if (!databaseConnectionPromise) {
    databaseConnectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
    }).catch((error) => {
      databaseConnectionPromise = null;
      throw error;
    });
  }
  return databaseConnectionPromise;
}

function getAllowedOrigins() {
  const configured = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production") return [...new Set(configured)];
  return [...new Set(["http://localhost:5173", "http://127.0.0.1:5173", ...configured])];
}

function createApp(app = express()) {
  const allowedOrigins = getAllowedOrigins();

  app.disable("x-powered-by");
  if (process.env.VERCEL) app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: process.env.NODE_ENV === "production",
  }));
  app.use(cors({
    origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.includes(origin))),
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Protection"],
    maxAge: 600,
  }));
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(requireTrustedMutationOrigin(allowedOrigins));
  if (process.env.VERCEL) {
    app.use(async (req, res, next) => {
      try {
        await connectForServerlessRequest();
        next();
      } catch (error) {
        const errorCode = error.code || error.cause?.code || error.name || "unknown";
        console.error(`MongoDB connection failed (code: ${errorCode}). Connection details are redacted.`);
        res.status(503).json({ success: false, message: "The database is temporarily unavailable." });
      }
    });
  }
  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/skillproof", skillProofRouter);

  app.get("/api/health", (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    res.status(databaseConnected ? 200 : 503).json({
      success: databaseConnected,
      message: databaseConnected
        ? "FreelancerHub API and database are ready."
        : "FreelancerHub API is running, but the database is unavailable.",
      database: databaseConnected ? "connected" : "disconnected",
    });
  });

  app.use((req, res) => res.status(404).json({ success: false, message: "API endpoint not found." }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed") return res.status(400).json({ success: false, message: "Request body must contain valid JSON." });
    if (error.type === "entity.too.large") return res.status(413).json({ success: false, message: "Request body is too large." });
    console.error("Unhandled API error.");
    return res.status(500).json({ success: false, message: "An unexpected server error occurred." });
  });

  return app;
}

module.exports = { createApp, getAllowedOrigins };
