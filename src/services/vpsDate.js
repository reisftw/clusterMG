export function resolveVpsDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object") {
    const raw = value.data || value.updatedAt || value.generatedAt || null;
    if (typeof raw === "string" || typeof raw === "number" || raw instanceof Date) {
      return resolveVpsDate(raw);
    }
  }

  return null;
}

