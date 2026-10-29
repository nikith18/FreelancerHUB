const { rateLimit } = require("express-rate-limit");

function createRateLimit({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message },
  });
}

const apiLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests. Please wait and try again.",
});

const loginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many sign-in attempts. Please wait 15 minutes and try again.",
});

const registrationLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Too many account creation attempts. Please wait and try again later.",
});

module.exports = { apiLimiter, loginLimiter, registrationLimiter, createRateLimit };
