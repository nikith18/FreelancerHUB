const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
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

function getAllowedOrigins() {
  const configured = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production") {
    const renderHostname = process.env.RENDER_EXTERNAL_HOSTNAME;
    const renderOrigin = renderHostname ? `https://${renderHostname}` : null;
    return [...new Set([...configured, ...(renderOrigin ? [renderOrigin] : [])])];
  }
  return [...new Set(["http://localhost:5173", "http://127.0.0.1:5173", ...configured])];
}

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.disable("x-powered-by");
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

  // Render serves the API and Vite client from one origin in production.
  // Keep API 404s as JSON and let the client router handle browser routes.
  const clientDist = path.resolve(__dirname, "../client/dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

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
