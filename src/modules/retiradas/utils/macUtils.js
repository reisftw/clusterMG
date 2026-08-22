const MAC_HEX_LENGTH = 12;
const OCR_HEX_FIXUPS = {
  O: "0",
  Q: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
};

function onlyHex(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
}

function normalizeOcrHex(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[OQDILZSBG]/g, (char) => OCR_HEX_FIXUPS[char] || char);
}

export function normalizeMac(value = "") {
  const directHex = onlyHex(value);

  if (directHex.length === MAC_HEX_LENGTH) {
    return directHex;
  }

  const fixedHex = onlyHex(normalizeOcrHex(value));
  return fixedHex.length === MAC_HEX_LENGTH ? fixedHex : "";
}

export function formatMac(value = "") {
  const normalized = normalizeMac(value);

  if (!normalized) return "";

  return normalized.match(/.{1,2}/g)?.join(":") || "";
}

function collectContextMatches(value = "", keyword) {
  const pattern = new RegExp(
    `${keyword}[\\s:=_-]*([0-9A-Z:\\-\\s()]{8,32})`,
    "gi",
  );
  return Array.from(value.matchAll(pattern), (match) => match[1] || "");
}

export function extractMacsFromText(value = "") {
  const text = String(value || "").toUpperCase();
  const keywordCandidates = [
    ...collectContextMatches(text, "MAC"),
    ...collectContextMatches(text, "WLAN"),
    ...collectContextMatches(text, "WI-FI"),
    ...collectContextMatches(text, "WIFI"),
  ];
  const directMatches = text.match(
    /\b(?:[0-9A-FGILOQSZ]{2}[-:\s]?){5}[0-9A-FGILOQSZ]{2}\b/g,
  );
  const compactMatches = text.match(/\b[0-9A-FGILOQSZ]{12,16}\b/g);
  const candidates = [
    ...keywordCandidates,
    ...(directMatches || []),
    ...(compactMatches || []),
  ];

  if (!candidates.length) return [];

  return Array.from(
    new Set(
      candidates
        .map((item) => formatMac(item))
        .filter(Boolean),
    ),
  );
}

