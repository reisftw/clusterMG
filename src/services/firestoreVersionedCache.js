import {
  getCachedValue,
  setCachedValue,
} from "./firestoreCache";

const inflightRequests = new Map();

function getTimestampMillis(value) {
  if (!value) return null;

  if (typeof value?.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    const millis = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(millis) ? millis : null;
  }

  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && String(asNumber) === value.trim()) {
      return asNumber;
    }

    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
  }

  return null;
}

function getVersionCandidate(value) {
  if (value === null || value === undefined) return null;

  const directMillis = getTimestampMillis(value);
  if (directMillis !== null) return { type: "ts", value: directMillis };

  if (typeof value !== "object") {
    return { type: "raw", value: String(value) };
  }

  const nestedKeys = [
    "data",
    "updatedAt",
    "lastUpdate",
    "texto",
    "ultimaAtualizacao",
    "atualizadoEm",
  ];

  for (const key of nestedKeys) {
    if (!(key in value)) continue;
    const nested = getVersionCandidate(value[key]);
    if (nested) return nested;
  }

  try {
    return { type: "json", value: JSON.stringify(value) };
  } catch {
    return { type: "raw", value: String(value) };
  }
}

export function toVersionToken(value) {
  const candidate = getVersionCandidate(value);
  if (!candidate) return "";
  return `${candidate.type}:${candidate.value}`;
}

export async function getOrLoadVersionedCachedValue(
  key,
  {
    ttlMs = 0,
    force = false,
    loadVersion,
    loadData,
    getCachedVersion = (data) => data?.versionToken,
    getFreshVersion = (data) => data?.versionToken,
  },
) {
  const requestKey = `${key}::versioned`;

  if (!force && inflightRequests.has(requestKey)) {
    return inflightRequests.get(requestKey);
  }

  const request = (async () => {
    const cached = !force ? getCachedValue(key, ttlMs) : null;

    if (!cached) {
      const freshData = await loadData();
      if (freshData !== null && freshData !== undefined) {
        setCachedValue(key, freshData);
      }
      return { data: freshData, fromCache: false };
    }

    const versionResult = await loadVersion();
    const remoteVersion = toVersionToken(
      versionResult && typeof versionResult === "object" && "version" in versionResult
        ? versionResult.version
        : versionResult,
    );
    const cachedVersion = toVersionToken(getCachedVersion(cached));

    if (remoteVersion && cachedVersion && remoteVersion === cachedVersion) {
      return { data: cached, fromCache: true };
    }

    const freshData =
      versionResult &&
      typeof versionResult === "object" &&
      Object.prototype.hasOwnProperty.call(versionResult, "data")
        ? versionResult.data
        : await loadData();

    const freshVersion = toVersionToken(getFreshVersion(freshData));
    if (freshData !== null && freshData !== undefined && freshVersion) {
      setCachedValue(key, freshData);
    } else if (freshData !== null && freshData !== undefined) {
      setCachedValue(key, freshData);
    }

    return { data: freshData, fromCache: false };
  })();

  inflightRequests.set(requestKey, request);

  try {
    return await request;
  } finally {
    inflightRequests.delete(requestKey);
  }
}
