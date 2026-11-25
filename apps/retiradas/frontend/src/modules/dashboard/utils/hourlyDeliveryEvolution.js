function number(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(date) {
	return date.toISOString().slice(0, 10);
}

function shiftDateKey(key, days) {
	const date = new Date(`${key}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return dateKey(date);
}

function hourOrder(label) {
	const match = String(label).match(/^(\d{1,2})(?:h|:)?(\d{2})?/i);
	return match ? Number(match[1]) * 60 + Number(match[2] || 0) : 9999;
}

function normalizeEntry(entry) {
	return {
		date: String(entry?.date || "").slice(0, 10),
		hours: Object.fromEntries(
			Object.entries(entry?.horarios || {}).map(([hour, value]) => [
				hour,
				number(value),
			]),
		),
	};
}

export function calculateChange(current, previous) {
	const difference = number(current) - number(previous);
	return {
		difference,
		percentage:
			number(previous) === 0
				? null
				: Math.round((difference / number(previous)) * 1000) / 10,
	};
}

function summarize(entries) {
	const hours = [...new Set(entries.flatMap((entry) => Object.keys(entry.hours)))].sort(
		(a, b) => hourOrder(a) - hourOrder(b) || a.localeCompare(b, "pt-BR"),
	);
	const totals = Object.fromEntries(
		hours.map((hour) => [
			hour,
			entries.reduce((sum, entry) => sum + number(entry.hours[hour]), 0),
		]),
	);
	return {
		days: entries.length,
		hours,
		totals,
		average: Object.fromEntries(
			hours.map((hour) => [
				hour,
				entries.length ? totals[hour] / entries.length : 0,
			]),
		),
		total: Object.values(totals).reduce((sum, value) => sum + value, 0),
	};
}

function comparePeriods(currentEntries, previousEntries) {
	const current = summarize(currentEntries);
	const previous = summarize(previousEntries);
	const hours = [...new Set([...current.hours, ...previous.hours])].sort(
		(a, b) => hourOrder(a) - hourOrder(b) || a.localeCompare(b, "pt-BR"),
	);
	return {
		currentDays: current.days,
		previousDays: previous.days,
		hours: hours.map((hour) => {
			const currentAverage = current.average[hour] || 0;
			const previousAverage = previous.average[hour] || 0;
			return {
				hour,
				current: currentAverage,
				previous: previousAverage,
				...calculateChange(currentAverage, previousAverage),
			};
		}),
		currentTotalAverage: current.days ? current.total / current.days : 0,
		previousTotalAverage: previous.days ? previous.total / previous.days : 0,
		...calculateChange(
			current.days ? current.total / current.days : 0,
			previous.days ? previous.total / previous.days : 0,
		),
	};
}

export function buildHourlyEvolution(entries = [], todayKey) {
	const normalized = entries
		.map(normalizeEntry)
		.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date));
	const byDate = new Map(normalized.map((entry) => [entry.date, entry]));
	const yesterdayKey = shiftDateKey(todayKey, -1);
	const today = byDate.get(todayKey) || normalizeEntry({ date: todayKey });
	const yesterday = byDate.get(yesterdayKey) || normalizeEntry({ date: yesterdayKey });
	const hours = [...new Set([...Object.keys(today.hours), ...Object.keys(yesterday.hours)])].sort(
		(a, b) => hourOrder(a) - hourOrder(b) || a.localeCompare(b, "pt-BR"),
	);
	const todayTotal = hours.reduce((sum, hour) => sum + number(today.hours[hour]), 0);
	const yesterdayTotal = hours.reduce(
		(sum, hour) => sum + number(yesterday.hours[hour]),
		0,
	);
	const weekStart = shiftDateKey(todayKey, -6);
	const previousWeekStart = shiftDateKey(todayKey, -13);
	const previousWeekEnd = shiftDateKey(todayKey, -7);
	const monthKey = todayKey.slice(0, 7);
	const monthDate = new Date(`${monthKey}-01T12:00:00Z`);
	monthDate.setUTCMonth(monthDate.getUTCMonth() - 1);
	const previousMonthKey = dateKey(monthDate).slice(0, 7);

	return {
		hasToday: byDate.has(todayKey),
		hasYesterday: byDate.has(yesterdayKey),
		todayKey,
		yesterdayKey,
		todayTotal,
		yesterdayTotal,
		...calculateChange(todayTotal, yesterdayTotal),
		hours: hours.map((hour) => ({
			hour,
			current: number(today.hours[hour]),
			previous: number(yesterday.hours[hour]),
			...calculateChange(today.hours[hour], yesterday.hours[hour]),
		})),
		week: comparePeriods(
			normalized.filter((entry) => entry.date >= weekStart && entry.date <= todayKey),
			normalized.filter(
				(entry) => entry.date >= previousWeekStart && entry.date <= previousWeekEnd,
			),
		),
		month: comparePeriods(
			normalized.filter((entry) => entry.date.startsWith(monthKey)),
			normalized.filter((entry) => entry.date.startsWith(previousMonthKey)),
		),
	};
}

export function saoPauloDateKey(date = new Date()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

