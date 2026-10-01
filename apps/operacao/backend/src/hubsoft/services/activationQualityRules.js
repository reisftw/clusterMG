const { ACTIVATION_QUALITY_CONFIG, SCHEDULE_STATUS } = require("./activationQualityConfig");
const { evaluateActivationHealth, resolveActivationDate } = require("./activationHealthRules");

function minutesDiff(a, b) {
	const diff = new Date(a).getTime() - new Date(b).getTime();
	if (!Number.isFinite(diff)) return null;
	return diff / 60000;
}

function classifyScheduleWindow(row = {}, config = ACTIVATION_QUALITY_CONFIG) {
	if (!row.scheduled_start_at || !row.scheduled_end_at || !row.executed_start_at) return SCHEDULE_STATUS.NO_DATA;
	const beforeStart = minutesDiff(row.scheduled_start_at, row.executed_start_at);
	const afterEnd = minutesDiff(row.executed_start_at, row.scheduled_end_at);
	if (beforeStart !== null && beforeStart > config.scheduleToleranceMinutes) return SCHEDULE_STATUS.EARLY;
	if (afterEnd !== null && afterEnd > config.scheduleToleranceMinutes) return SCHEDULE_STATUS.LATE;
	return SCHEDULE_STATUS.ON_TIME;
}

function executionDurationMinutes(row = {}) {
	if (!row.executed_start_at || !row.executed_end_at) return null;
	const minutes = minutesDiff(row.executed_end_at, row.executed_start_at);
	return minutes !== null && minutes >= 0 ? minutes : null;
}

function daysSince(date, now = new Date()) {
	if (!date) return null;
	const start = new Date(date).getTime();
	const end = new Date(now).getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	return Math.floor((end - start) / 86400000);
}

function eligibleForWindow(row = {}, days, now = new Date()) {
	const activationDate = resolveActivationDate(row);
	const elapsed = daysSince(activationDate, now);
	return elapsed !== null && elapsed >= days;
}

function parseSupportEvents(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	try {
		return JSON.parse(value);
	} catch (_error) {
		return [];
	}
}

function qualitySupportEvents(row = {}) {
	return parseSupportEvents(row.support_events).filter((event) => event.affectsActivationQuality === true);
}

function eventWithinWindow(row = {}, event = {}, days) {
	const activationDate = resolveActivationDate(row);
	const eventDate = event.openedAt || event.opened_at;
	if (!activationDate || !eventDate) return false;
	const diff = daysSince(activationDate, new Date(eventDate));
	return diff !== null && diff >= 0 && diff <= days;
}

function hasReworkWithin(row = {}, days) {
	return qualitySupportEvents(row).some((event) => eventWithinWindow(row, event, days));
}

function isRepeatedSupport(row = {}) {
	return qualitySupportEvents(row).length >= 2;
}

function analyzeActivationQuality(row = {}, options = {}) {
	const now = options.now || new Date();
	const health = evaluateActivationHealth(row, { now });
	const scheduleStatus = classifyScheduleWindow(row);
	const durationMinutes = executionDurationMinutes(row);
	const windows = {};
	for (const days of ACTIVATION_QUALITY_CONFIG.reworkWindows) {
		windows[`d${days}`] = {
			eligible: eligibleForWindow(row, days, now),
			hasRework: hasReworkWithin(row, days),
		};
	}
	return {
		id: row.id,
		scheduleStatus,
		durationMinutes,
		health,
		supportEvents: qualitySupportEvents(row),
		repeatedSupport: isRepeatedSupport(row),
		windows,
		analyzable: Boolean(resolveActivationDate(row)),
		activationDate: resolveActivationDate(row),
	};
}

module.exports = {
	analyzeActivationQuality,
	classifyScheduleWindow,
	eligibleForWindow,
	executionDurationMinutes,
	hasReworkWithin,
	isRepeatedSupport,
	qualitySupportEvents,
};
