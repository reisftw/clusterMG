const ACTIVATION_QUALITY_CONFIG = Object.freeze({
	scheduleToleranceMinutes: 15,
	minQualitySampleSize: 10,
	reworkWindows: [7, 15, 30],
});

const SCHEDULE_STATUS = Object.freeze({
	ON_TIME: "ON_TIME",
	EARLY: "EARLY",
	LATE: "LATE",
	NO_DATA: "NO_DATA",
});

module.exports = { ACTIVATION_QUALITY_CONFIG, SCHEDULE_STATUS };
