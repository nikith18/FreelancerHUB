
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const mongoose = require("mongoose");

async function testConnection() {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

    console.log("MongoDB Atlas connected successfully!");
    console.log("Database:", mongoose.connection.name);

    await mongoose.disconnect();
    console.log("Connection closed successfully.");
  } catch (error) {
    console.error("MongoDB connection failed.");
    const errorCode = error.code || error.cause?.code || "unknown";
    console.error(`Connection diagnosis: ${error.name} (code: ${errorCode}). The URI and credentials are redacted.`);
    process.exitCode = 1;
  }
}

testConnection();
