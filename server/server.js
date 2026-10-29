require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const mongoose = require("mongoose");
const { createApp, getAllowedOrigins } = require("./app");

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
    throw new Error("Production startup requires JWT_SECRET with at least 32 bytes.");
  }
  if (!process.env.MONGODB_URI || /<[^>]+>|cluster-address|xxxxx/i.test(process.env.MONGODB_URI)) {
    throw new Error("Production startup requires a valid MONGODB_URI without template placeholders.");
  }
  const origins = getAllowedOrigins();
  if (!origins.length || origins.includes("*") || origins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.origin !== origin || parsed.protocol !== "https:";
    } catch { return true; }
  })) {
    throw new Error("Production startup requires explicit HTTPS CLIENT_ORIGIN values.");
  }
}

validateProductionConfiguration();

const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be an integer from 1 to 65535.");

const app = createApp();
const server = app.listen(PORT, () => console.log(`FreelancerHub API listening on port ${PORT}`));

async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.error("MongoDB connection is not configured (MONGODB_URI is missing). The API will remain available for health checks.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connection established.");
  } catch (error) {
    const errorCode = error.code || error.cause?.code || error.name || "unknown";
    console.error(`MongoDB connection failed (code: ${errorCode}). Check DNS, Atlas network access, and credentials locally; connection details are redacted.`);
  }
}

async function shutdown(signal) {
  console.log(`Received ${signal}; closing the API server.`);
  server.close(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
connectToDatabase();

module.exports = { app, server };
