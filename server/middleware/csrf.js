const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requireTrustedMutationOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    if (!origin || !allowedOrigins.includes(origin) || req.get("x-csrf-protection") !== "1") {
      return res.status(403).json({ success: false, message: "This request could not be verified. Refresh the page and try again." });
    }
    return next();
  };
}

module.exports = { requireTrustedMutationOrigin };
