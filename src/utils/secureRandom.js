let fallbackCounter = 0;

export function createSecureId(prefix = "id") {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackCounter += 1;
  return `${prefix}_${Date.now()}_${fallbackCounter}`;
}

export function secureRandomHex(byteLength = 32) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Gerador criptográfico não disponível neste navegador.");
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function secureRandomNumberString(min = 100, max = 999) {
  if (!globalThis.crypto?.getRandomValues) return String(min);
  const range = Math.max(1, max - min + 1);
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return String(min + (bytes[0] % range));
}
