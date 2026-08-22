const memoryCache = new Map();
const inflightRequests = new Map();
const STORAGE_PREFIX = "data-cache::";

function getStorageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorageEntry(key) {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!("createdAt" in parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeStorageEntry(key, entry) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // Ignora falhas de serializacao/espaco para manter o cache em memoria funcionando.
  }
}

function removeStorageEntry(key) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(getStorageKey(key));
  } catch {
    // Sem impacto funcional se a limpeza falhar.
  }
}

export function buildCacheKey(parts) {
  return parts
    .flatMap((part) => {
      if (part === undefined || part === null || part === "") return [];
      if (Array.isArray(part)) return [JSON.stringify(part)];
      if (typeof part === "object") return [JSON.stringify(part)];
      return [String(part)];
    })
    .join("::");
}

export function getCachedValue(key, ttlMs = 0) {
  const entry = memoryCache.get(key);
  const resolvedEntry = entry || readStorageEntry(key);
  if (!resolvedEntry) return null;

  if (ttlMs > 0 && Date.now() - resolvedEntry.createdAt > ttlMs) {
    memoryCache.delete(key);
    removeStorageEntry(key);
    return null;
  }

  if (!entry) {
    memoryCache.set(key, resolvedEntry);
  }

  return resolvedEntry.value;
}

export function setCachedValue(key, value) {
  const entry = {
    value,
    createdAt: Date.now(),
  };

  memoryCache.set(key, entry);
  writeStorageEntry(key, entry);

  return value;
}

export function invalidateCache(keyOrPrefix) {
  if (!keyOrPrefix) return;

  for (const key of memoryCache.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}::`)) {
      memoryCache.delete(key);
    }
  }

  if (!canUseLocalStorage()) return;

  try {
    const storageKeys = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey?.startsWith(STORAGE_PREFIX)) continue;

      const cacheKey = storageKey.slice(STORAGE_PREFIX.length);
      if (cacheKey === keyOrPrefix || cacheKey.startsWith(`${keyOrPrefix}::`)) {
        storageKeys.push(storageKey);
      }
    }

    storageKeys.forEach((storageKey) => window.localStorage.removeItem(storageKey));
  } catch {
    // Se falhar, a invalidacao em memoria ainda impede reuso na sessao atual.
  }
}

export async function getOrLoadCachedValue(key, loader, { ttlMs = 0, force = false } = {}) {
  if (!force) {
    const cached = getCachedValue(key, ttlMs);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }
  }

  if (!force && inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const request = (async () => {
    const data = await loader();
    if (data !== null && data !== undefined) {
      setCachedValue(key, data);
    }
    return { data, fromCache: false };
  })();

  inflightRequests.set(key, request);

  try {
    return await request;
  } finally {
    inflightRequests.delete(key);
  }
}

