function validDateOrNull(date) {
  return Number.isNaN(date?.getTime?.()) ? null : date;
}

function timestampObjectToDate(value) {
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds !== "number") return null;

  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  return validDateOrNull(new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)));
}

export function resolveDataDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return validDateOrNull(value.toDate());
  if (value instanceof Date) return validDateOrNull(value);
  if (typeof value === "string" || typeof value === "number") return validDateOrNull(new Date(value));
  if (typeof value === "object") return timestampObjectToDate(value);
  return null;
}
