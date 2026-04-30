export function resolveFirestoreDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? null : date;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object") {
    const seconds =
      value.seconds ??
      value._seconds ??
      null;
    const nanoseconds =
      value.nanoseconds ??
      value._nanoseconds ??
      0;

    if (typeof seconds === "number") {
      const millis = seconds * 1000 + Math.floor(nanoseconds / 1e6);
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}
