const jwt = require("jsonwebtoken");

const SESSION_TTL_SECONDS = 60 * 60;
const JWT_ISSUER = process.env.JWT_ISSUER || "freelancerhub-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "freelancerhub-web";

function createSessionToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("JWT_SECRET must contain at least 32 bytes.");
  return jwt.sign(
    { sub: user._id.toString(), ver: user.sessionVersion ?? 0 },
    secret,
    { algorithm: "HS256", expiresIn: SESSION_TTL_SECONDS, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  );
}

module.exports = {
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_TTL_SECONDS,
  createSessionToken,
};
