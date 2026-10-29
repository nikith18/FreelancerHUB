require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function seed() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo account seeding is disabled in production.");
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set DEMO_PASSWORD to a development password of at least 10 characters in server/.env.");
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in server/.env before seeding.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const accounts = [
    ["admin@freelancerhub.demo", "FreelancerHub Admin", "admin"],
    ["client@freelancerhub.demo", "FreelancerHub Client", "client"],
    ["freelancer@freelancerhub.demo", "FreelancerHub Freelancer", "freelancer"],
  ];
  for (const [email, name, role] of accounts) {
    const existing = await User.exists({ email });
    if (existing) {
      console.log(`${email}: already exists; left unchanged.`);
      continue;
    }
    await User.create({ email, name, role, passwordHash: await bcrypt.hash(password, 12) });
    console.log(`${email}: created.`);
  }
  await mongoose.disconnect();
  console.log("Development demo account seed completed.");
}

seed().catch(async (error) => {
  const safeSetupMessage = /^(Demo account seeding is disabled|Set DEMO_PASSWORD|Set MONGODB_URI)/.test(error.message || "");
  const reason = safeSetupMessage ? error.message : `The database or seed operation failed (${error.code || error.name || "unknown"}); connection details are hidden.`;
  console.error(`Demo account seed failed: ${reason}`);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
