const MAX_OFFSET = 100000;

function parsePageParams(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
  };
  const page = parse(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parse(query.limit, defaultLimit, maxLimit);
  if (page === null || limit === null || (page - 1) * limit > MAX_OFFSET) return null;
  return { page, limit };
}

module.exports = { MAX_OFFSET, parsePageParams };
