import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	emitRealtimeUpdate,
	subscribeRealtimeTopics,
} from "../../../services/realtimeEvents";
import {
	createVpsDocument,
	listVpsDocuments,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

export const DIARIO_HORARIOS = ["11h", "14h", "16h", "18h"];
export const DIARIO_AFTER_HOURS_HORARIO = "23:59";
export const DIARIO_CADASTRO_HORARIOS = [
	...DIARIO_HORARIOS,
	DIARIO_AFTER_HOURS_HORARIO,
];

export function localDateKey(date = new Date()) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

export function parseDateKey(value) {
	if (!value) return null;
	const [year, month, day] = String(value).split("-").map(Number);
	if (!year || !month || !day) return null;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function monthKeyFromDateKey(dateKey = localDateKey()) {
	return String(dateKey).slice(0, 7);
}

export function monthRangeFromDateKey(dateKey = localDateKey()) {
	const date = parseDateKey(dateKey) || new Date();
	const start = new Date(date.getFullYear(), date.getMonth(), 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	return {
		start: localDateKey(start),
		end: localDateKey(end),
	};
}

export function monthWeekRangesFromDateKey(dateKey = localDateKey()) {
	const date = parseDateKey(dateKey) || new Date();
	const year = date.getFullYear();
	const monthIndex = date.getMonth();
	const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
	const baseLength = Math.floor(daysInMonth / 4);
	const extraDays = daysInMonth % 4;
	let startDay = 1;

	return Array.from({ length: 4 }, (_, index) => {
		const length = baseLength + (index < extraDays ? 1 : 0);
		const endDay = startDay + length - 1;
		const range = {
			week: index + 1,
			start: localDateKey(new Date(year, monthIndex, startDay)),
			end: localDateKey(new Date(year, monthIndex, endDay)),
		};
		startDay = endDay + 1;
		return range;
	});
}

export function weekRangeFromDateKey(dateKey = localDateKey()) {
	const normalizedDateKey = localDateKey(parseDateKey(dateKey) || new Date());
	return (
		monthWeekRangesFromDateKey(normalizedDateKey).find(
			(range) =>
				normalizedDateKey >= range.start && normalizedDateKey <= range.end,
		) || monthWeekRangesFromDateKey(normalizedDateKey)[0]
	);
}

export function getWeekOfMonth(dateKey) {
	return weekRangeFromDateKey(dateKey).week;
}

export function formatDateLabel(dateKey, options = {}) {
	const date = parseDateKey(dateKey);
	if (!date) return "--";
	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: options.month ? "2-digit" : undefined,
		weekday: options.weekday ? "short" : undefined,
	});
}

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function normalizeDiarioEntry(entry = {}) {
	const horarios = DIARIO_CADASTRO_HORARIOS.reduce((result, horario) => {
		result[horario] = toNumber(entry.horarios?.[horario] ?? entry[horario]);
		return result;
	}, {});
	const hourlyTotal = DIARIO_CADASTRO_HORARIOS.reduce(
		(sum, horario) => sum + horarios[horario],
		0,
	);

	return {
		date: entry.date || localDateKey(),
		monthKey: monthKeyFromDateKey(entry.date || localDateKey()),
		horarios,
		deliveredTotal: hourlyTotal,
		hourlyTotal,
		afterHoursTotal: horarios[DIARIO_AFTER_HOURS_HORARIO] || 0,
		fines: toNumber(entry.fines),
		notes: String(entry.notes || "").trim(),
	};
}

export async function saveDiarioEntry(entry, audit = {}) {
	const normalized = normalizeDiarioEntry(entry);
	const previous = audit.previousEntry
		? normalizeDiarioEntry(audit.previousEntry)
		: null;
	await updateVpsDocument(
		`${COLLECTIONS.ACOMPANHAMENTO_DIARIO}/${normalized.date}`,
		{
			...normalized,
			updatedBy: audit.userId || null,
			updatedByName: audit.userName || "Sistema",
			updatedAt: new Date().toISOString(),
		},
	);

	await createVpsDocument(COLLECTIONS.ACOMPANHAMENTO_DIARIO_LOGS, {
		entryDate: normalized.date,
		monthKey: normalized.monthKey,
		action: audit.action || "atualizou",
		userId: audit.userId || null,
		userName: audit.userName || "Sistema",
		snapshot: {
			horarios: normalized.horarios,
			hourlyTotal: normalized.hourlyTotal,
			fines: normalized.fines,
			notes: normalized.notes,
		},
		previousSnapshot: previous
			? {
					horarios: previous.horarios,
					hourlyTotal: previous.hourlyTotal,
					fines: previous.fines,
					notes: previous.notes,
				}
			: null,
		createdAt: new Date().toISOString(),
	});

	emitRealtimeUpdate("diario", {
		collectionPath: COLLECTIONS.ACOMPANHAMENTO_DIARIO,
		documentId: normalized.date,
	});
	emitRealtimeUpdate("acompanhamento", {
		collectionPath: COLLECTIONS.ACOMPANHAMENTO_DIARIO,
		documentId: normalized.date,
	});

	return normalized;
}

export function subscribeDiarioLogsByMonth(dateKey, callback, onError) {
	let active = true;
	const load = async () => {
		try {
			const logs = (
				await listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO_LOGS, {
					limit: 1000,
				})
			)
				.filter((item) => item.monthKey === monthKeyFromDateKey(dateKey))
				.sort((a, b) => {
					const dateA = Date.parse(a.createdAt || "") || 0;
					const dateB = Date.parse(b.createdAt || "") || 0;
					return dateB - dateA;
				});
			if (active) callback(logs);
		} catch (error) {
			onError?.(error);
		}
	};
	load().catch(onError);
	const timer = window.setInterval(load, 30000);
	const unsubscribeRealtime = subscribeRealtimeTopics(
		["diario", "acompanhamento"],
		() => {
			load().catch(onError);
		},
		{ debounceMs: 250 },
	);
	return () => {
		active = false;
		window.clearInterval(timer);
		unsubscribeRealtime();
	};
}

export function subscribeDiarioLogsByDate(dateKey, callback, onError) {
	let active = true;
	const load = async () => {
		try {
			const logs = (
				await listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO_LOGS, {
					limit: 1000,
				})
			)
				.filter((item) => item.entryDate === dateKey)
				.sort((a, b) =>
					String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
				)
				.slice(0, 12);
			if (active) callback(logs);
		} catch (error) {
			onError?.(error);
		}
	};
	load();
	const timer = window.setInterval(load, 30000);
	const unsubscribeRealtime = subscribeRealtimeTopics(
		["diario", "acompanhamento"],
		() => {
			load().catch(onError);
		},
		{ debounceMs: 250 },
	);
	return () => {
		active = false;
		window.clearInterval(timer);
		unsubscribeRealtime();
	};
}

export function subscribeDiarioEntriesByMonth(dateKey, callback, onError) {
	const range = monthRangeFromDateKey(dateKey);
	let active = true;
	const load = async () => {
		try {
			const entries = (
				await listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO, {
					limit: 1000,
				})
			)
				.filter((item) => item.date >= range.start && item.date <= range.end)
				.sort((a, b) =>
					String(a.date || "").localeCompare(String(b.date || "")),
				)
				.map((item) => normalizeDiarioEntry(item));
			if (active) callback(entries);
		} catch (error) {
			onError?.(error);
		}
	};
	load();
	const timer = window.setInterval(load, 30000);
	const unsubscribeRealtime = subscribeRealtimeTopics(
		["diario", "acompanhamento"],
		() => {
			load().catch(onError);
		},
		{ debounceMs: 250 },
	);
	return () => {
		active = false;
		window.clearInterval(timer);
		unsubscribeRealtime();
	};
}

export function subscribeDiarioEvolutionEntries(callback, onError) {
	let active = true;
	const load = async () => {
		try {
			const entries = (
				await listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO, {
					limit: 1000,
				})
			)
				.map((item) => normalizeDiarioEntry(item))
				.sort((a, b) => a.date.localeCompare(b.date));
			if (active) callback(entries);
		} catch (error) {
			onError?.(error);
		}
	};
	load().catch(onError);
	const timer = window.setInterval(load, 60000);
	const unsubscribeRealtime = subscribeRealtimeTopics(
		["diario", "acompanhamento"],
		() => load().catch(onError),
		{ debounceMs: 250 },
	);
	return () => {
		active = false;
		window.clearInterval(timer);
		unsubscribeRealtime();
	};
}

export function classifyWeeklyProduction(total) {
	const value = Number(total || 0);
	if (value > 600) return { label: "Em dia!", tone: "good" };
	if (value >= 400) return { label: "Em melhora", tone: "warn" };
	return { label: "Em alerta", tone: "bad" };
}

export function buildDiarioBoardData(
	entries = [],
	referenceDateKey = localDateKey(),
) {
	const monthRange = monthRangeFromDateKey(referenceDateKey);
	const weekRanges = monthWeekRangesFromDateKey(referenceDateKey);
	const weekRange = weekRangeFromDateKey(referenceDateKey);
	const sortedEntries = [...entries].sort((a, b) =>
		a.date.localeCompare(b.date),
	);
	const byDate = new Map(sortedEntries.map((entry) => [entry.date, entry]));
	const weekEntries = sortedEntries.filter(
		(entry) => entry.date >= weekRange.start && entry.date <= weekRange.end,
	);
	const weekDays = [];
	const startDate = parseDateKey(weekRange.start);
	const endDate = parseDateKey(weekRange.end);
	if (startDate && endDate) {
		const rangeLength = Math.round((endDate - startDate) / 86_400_000) + 1;
		for (let index = 0; index < rangeLength; index += 1) {
			const current = new Date(startDate);
			current.setDate(startDate.getDate() + index);
			const date = localDateKey(current);
			weekDays.push(byDate.get(date) || normalizeDiarioEntry({ date }));
		}
	}

	const monthEntries = sortedEntries.filter(
		(entry) => entry.date >= monthRange.start && entry.date <= monthRange.end,
	);
	const weeks = weekRanges.map((range) => {
		const items = monthEntries.filter(
			(entry) => entry.date >= range.start && entry.date <= range.end,
		);
		const delivered = items.reduce(
			(sum, item) => sum + Number(item.hourlyTotal || 0),
			0,
		);
		const fines = items.reduce((sum, item) => sum + Number(item.fines || 0), 0);
		return {
			week: range.week,
			range,
			delivered,
			fines,
			status: classifyWeeklyProduction(delivered),
		};
	});
	const currentWeek = weekRange.week;
	const currentWeekDelivered = weekEntries.reduce(
		(sum, item) => sum + Number(item.hourlyTotal || 0),
		0,
	);
	const currentWeekData = {
		week: currentWeek,
		delivered: currentWeekDelivered,
		fines: weekEntries.reduce(
			(sum, item) => sum + Number(item.fines || 0),
			0,
		),
		status: classifyWeeklyProduction(currentWeekDelivered),
		range: weekRange,
	};

	return {
		referenceDateKey,
		monthKey: monthKeyFromDateKey(referenceDateKey),
		weekRange,
		weekRanges,
		monthRange,
		weekDays,
		monthEntries,
		weeks,
		currentWeek: currentWeekData,
		totals: {
			weekDelivered: weekEntries.reduce(
				(sum, item) => sum + Number(item.hourlyTotal || 0),
				0,
			),
			monthDelivered: monthEntries.reduce(
				(sum, item) => sum + Number(item.hourlyTotal || 0),
				0,
			),
			monthFines: monthEntries.reduce(
				(sum, item) => sum + Number(item.fines || 0),
				0,
			),
		},
	};
}

export function buildDiarioMonthlyGoalsSnapshot(
	boardData,
	{ savedBy = null, savedByName = "Sistema" } = {},
) {
	const monthKey = boardData?.monthKey || monthKeyFromDateKey();
	const weeks = (Array.isArray(boardData?.weeks) ? boardData.weeks : []).map(
		(week) => ({
			week: Number(week.week || 0),
			delivered: Number(week.delivered || 0),
			fines: Number(week.fines || 0),
			status: week.status || classifyWeeklyProduction(week.delivered),
		}),
	);
	const monthDelivered = weeks.reduce(
		(sum, week) => sum + Number(week.delivered || 0),
		0,
	);
	const monthFines = weeks.reduce(
		(sum, week) => sum + Number(week.fines || 0),
		0,
	);

	return {
		monthKey,
		referenceDateKey: boardData?.referenceDateKey || localDateKey(),
		monthRange: boardData?.monthRange || monthRangeFromDateKey(),
		weeks,
		totals: {
			monthDelivered,
			monthFines,
		},
		savedBy,
		savedByName,
		savedAt: new Date().toISOString(),
	};
}

export function compareDiarioMonthlyGoals(current, previous) {
	const currentTotals = current?.totals || {};
	const previousTotals = previous?.totals || {};
	const deliveredDiff =
		Number(currentTotals.monthDelivered || 0) -
		Number(previousTotals.monthDelivered || 0);
	const finesDiff =
		Number(currentTotals.monthFines || 0) -
		Number(previousTotals.monthFines || 0);
	const previousDelivered = Number(previousTotals.monthDelivered || 0);

	return {
		deliveredDiff,
		finesDiff,
		deliveredPercent:
			previousDelivered > 0
				? Number(((deliveredDiff / previousDelivered) * 100).toFixed(1))
				: null,
		weeks: [1, 2, 3, 4].map((weekNumber) => {
			const currentWeek =
				current?.weeks?.find((week) => Number(week.week) === weekNumber) || {};
			const previousWeek =
				previous?.weeks?.find((week) => Number(week.week) === weekNumber) || {};
			return {
				week: weekNumber,
				deliveredDiff:
					Number(currentWeek.delivered || 0) -
					Number(previousWeek.delivered || 0),
				finesDiff:
					Number(currentWeek.fines || 0) - Number(previousWeek.fines || 0),
			};
		}),
	};
}

export async function saveDiarioMonthlyGoalsSnapshot(boardData, audit = {}) {
	const snapshot = buildDiarioMonthlyGoalsSnapshot(boardData, {
		savedBy: audit.userId || null,
		savedByName: audit.userName || "Sistema",
	});
	await setVpsDocument(
		`${COLLECTIONS.ACOMPANHAMENTO_DIARIO_METAS_HISTORICO}/${snapshot.monthKey}`,
		snapshot,
	);
	return snapshot;
}

export async function listDiarioMonthlyGoalsSnapshots() {
	const [savedSnapshots, diarioEntries] = await Promise.all([
		listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO_METAS_HISTORICO, {
			limit: 120,
		}).catch(() => []),
		listVpsDocuments(COLLECTIONS.ACOMPANHAMENTO_DIARIO, {
			limit: 1000,
		}).catch(() => []),
	]);
	const snapshotsByMonth = new Map();

	diarioEntries
		.map((entry) => normalizeDiarioEntry(entry))
		.forEach((entry) => {
			const list = snapshotsByMonth.get(entry.monthKey) || [];
			list.push(entry);
			snapshotsByMonth.set(entry.monthKey, list);
		});

	for (const [monthKey, entries] of snapshotsByMonth.entries()) {
		const virtualSnapshot = buildDiarioMonthlyGoalsSnapshot(
			buildDiarioBoardData(entries, `${monthKey}-15`),
			{
				savedBy: null,
				savedByName: "Sistema",
			},
		);
		snapshotsByMonth.set(monthKey, {
			...virtualSnapshot,
			savedAt: null,
			generatedFromEntries: true,
		});
	}

	savedSnapshots.forEach((snapshot) => {
		const monthKey = snapshot.monthKey || snapshot.id;
		if (!monthKey) return;
		snapshotsByMonth.set(monthKey, {
			...snapshot,
			monthKey,
			weeks: Array.isArray(snapshot.weeks) ? snapshot.weeks : [],
			totals: snapshot.totals || {},
			generatedFromEntries: false,
		});
	});

	return [...snapshotsByMonth.values()]
		.map((snapshot) => ({
			...snapshot,
			monthKey: snapshot.monthKey || snapshot.id,
			weeks: Array.isArray(snapshot.weeks) ? snapshot.weeks : [],
			totals: snapshot.totals || {},
		}))
		.sort((a, b) => String(b.monthKey || "").localeCompare(a.monthKey || ""));
}
