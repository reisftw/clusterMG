const INTERNAL_DATA_JSON_URL =
  "https://storage.googleapis.com/gestao-retirada.firebasestorage.app/static/internal/data.json";
export const INTERNAL_STATIC_DATA_UPDATED_EVENT = "internal-static-data-updated";
const INTERNAL_STATIC_DATA_VERSION_KEY = "internal-static-data-version";

let cache = null;
let pendingRequest = null;

function getVersionToken() {
  if (typeof window === "undefined") return "initial";
  return window.localStorage.getItem(INTERNAL_STATIC_DATA_VERSION_KEY) || "initial";
}

function buildInternalDataUrl() {
  const version = encodeURIComponent(getVersionToken());
  return `${INTERNAL_DATA_JSON_URL}?v=${version}`;
}

export function invalidateInternalStaticDataCache(versionToken = null) {
  cache = null;
  pendingRequest = null;

  if (typeof window === "undefined") return;

  const nextVersion = versionToken || new Date().toISOString();
  window.localStorage.setItem(INTERNAL_STATIC_DATA_VERSION_KEY, nextVersion);
  window.dispatchEvent(
    new CustomEvent(INTERNAL_STATIC_DATA_UPDATED_EVENT, {
      detail: { version: nextVersion },
    }),
  );
}

export async function getInternalStaticData({ force = false } = {}) {
  if (!force && cache) return cache;
  if (!force && pendingRequest) return pendingRequest;

  const request = fetch(buildInternalDataUrl(), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((json) => {
      cache = json;
      pendingRequest = null;
      return json;
    })
    .catch((error) => {
      pendingRequest = null;
      throw error;
    });

  pendingRequest = request;
  return request;
}

export async function getInternalStaticDataSlice(selector, { force = false } = {}) {
  try {
    const data = await getInternalStaticData({ force });
    return typeof selector === "function" ? selector(data) : data;
  } catch {
    return null;
  }
}

export async function getInternalStaticDataMeta({ force = false } = {}) {
  try {
    const data = await getInternalStaticData({ force });
    return {
      available: Boolean(data?.generatedAt),
      generatedAt: data?.generatedAt || null,
    };
  } catch {
    return {
      available: false,
      generatedAt: null,
    };
  }
}

export function getCachedInternalStaticData() {
  return cache;
}
