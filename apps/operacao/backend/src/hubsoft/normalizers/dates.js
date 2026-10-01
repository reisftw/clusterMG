function parseHubsoftDate(value) {
	if (!value) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
	const raw = String(value).trim();
	if (!raw) return null;
	const iso = new Date(raw);
	if (!Number.isNaN(iso.getTime())) return iso.toISOString();
	const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (!br) return null;
	const [, day, month, year, hour = "00", minute = "00", second = "00"] = br;
	const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = { parseHubsoftDate };
