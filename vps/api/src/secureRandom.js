const crypto = require("crypto");

function randomId(prefix = "id", bytes = 6) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(bytes).toString("hex")}`;
}

function randomIntInclusive(min, max) {
  const normalizedMin = Math.ceil(Number(min));
  const normalizedMax = Math.floor(Number(max));
  if (!Number.isFinite(normalizedMin) || !Number.isFinite(normalizedMax)) return 0;
  if (normalizedMax <= normalizedMin) return normalizedMin;
  return crypto.randomInt(normalizedMin, normalizedMax + 1);
}

function randomFloat(min = 0, max = 1) {
  const value = crypto.randomInt(0, 1_000_000) / 1_000_000;
  return Number(min) + value * (Number(max) - Number(min));
}

module.exports = {
  randomFloat,
  randomId,
  randomIntInclusive,
};
