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

export function weekRangeFromDateKey(dateKey = localDateKey()) {
	const date = parseDateKey(dateKey) || new Date();
	const day = date.getDay();
	const mondayOffset = day === 0 ? -6 : 1 - day;
	const monday = new Date(date);
	monday.setDate(date.getDate() + mondayOffset);
	const friday = new Date(monday);
	friday.setDate(monday.getDate() + 4);
	return {
		start: localDateKey(monday),
		end: localDateKey(friday),
	};
}

export function getWeekOfMonth(dateKey) {
	const date = parseDateKey(dateKey);
	if (!date) return 1;
	return Math.min(4, Math.floor((date.getDate() - 1) / 7) + 1);
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
	if (startDate) {
		for (let index = 0; index < 5; index += 1) {
			const current = new Date(startDate);
			current.setDate(startDate.getDate() + index);
			const date = localDateKey(current);
			weekDays.push(byDate.get(date) || normalizeDiarioEntry({ date }));
		}
	}

	const monthEntries = sortedEntries.filter(
		(entry) => entry.date >= monthRange.start && entry.date <= monthRange.end,
	);
	const weeks = [1, 2, 3, 4].map((week) => {
		const items = monthEntries.filter(
			(entry) => getWeekOfMonth(entry.date) === week,
		);
		const delivered = items.reduce(
			(sum, item) => sum + Number(item.hourlyTotal || 0),
			0,
		);
		const fines = items.reduce((sum, item) => sum + Number(item.fines || 0), 0);
		return {
			week,
			delivered,
			fines,
			status: classifyWeeklyProduction(delivered),
		};
	});
	const currentWeek = getWeekOfMonth(referenceDateKey);
	const currentWeekData =
		weeks.find((item) => item.week === currentWeek) || weeks[0];

	return {
		referenceDateKey,
		monthKey: monthKeyFromDateKey(referenceDateKey),
		weekRange,
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
	const snapshots = await listVpsDocuments(
		COLLECTIONS.ACOMPANHAMENTO_DIARIO_METAS_HISTORICO,
		{ limit: 120 },
	);
	return snapshots
		.map((snapshot) => ({
			...snapshot,
			monthKey: snapshot.monthKey || snapshot.id,
			weeks: Array.isArray(snapshot.weeks) ? snapshot.weeks : [],
			totals: snapshot.totals || {},
		}))
		.sort((a, b) => String(b.monthKey || "").localeCompare(a.monthKey || ""));
}
