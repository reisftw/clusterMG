const HUBSOFT_TIMEZONE = "America/Sao_Paulo";
const HUBSOFT_OFFSET = "-03:00";

function hasExplicitTimezone(value) {
	return /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value || "").trim());
}

function parseHubsoftDate(value) {
	if (!value) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
	const raw = String(value).trim();
	if (!raw) return null;
	const localIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (localIso && !hasExplicitTimezone(raw)) {
		const [, year, month, day, hour = "00", minute = "00", second = "00"] = localIso;
		const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${HUBSOFT_OFFSET}`);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (br) {
		const [, day, month, year, hour = "00", minute = "00", second = "00"] = br;
		const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${HUBSOFT_OFFSET}`);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const iso = new Date(raw);
	return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function localDateKey(value, timeZone = HUBSOFT_TIMEZONE) {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const get = (type) => parts.find((part) => part.type === type)?.value || "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

function localDateTimeForHubsoft(date, endOfDay = false) {
	const day = typeof date === "string" ? date.slice(0, 10) : localDateKey(date);
	return `${day}T${endOfDay ? "23:59:59" : "00:00:00"}${HUBSOFT_OFFSET}`;
}

function addLocalDays(day, amount) {
	const date = new Date(`${day}T12:00:00${HUBSOFT_OFFSET}`);
	date.setUTCDate(date.getUTCDate() + Number(amount || 0));
	return localDateKey(date);
}

function localMonthStart(day, monthOffset = 0) {
	const [year, month] = String(day).slice(0, 10).split("-").map(Number);
	const date = new Date(`${year}-${String(month).padStart(2, "0")}-15T12:00:00${HUBSOFT_OFFSET}`);
	date.setUTCMonth(date.getUTCMonth() + Number(monthOffset || 0), 1);
	return localDateKey(date);
}

function localMonthEnd(day, monthOffset = 0) {
	const [year, month] = String(day).slice(0, 10).split("-").map(Number);
	const date = new Date(`${year}-${String(month).padStart(2, "0")}-15T12:00:00${HUBSOFT_OFFSET}`);
	date.setUTCMonth(date.getUTCMonth() + Number(monthOffset || 0) + 1, 0);
	return localDateKey(date);
}

module.exports = {
	HUBSOFT_TIMEZONE,
	addLocalDays,
	localDateKey,
	localDateTimeForHubsoft,
	localMonthEnd,
	localMonthStart,
	parseHubsoftDate,
};
