const assert = require("node:assert/strict");
const test = require("node:test");
const {
	analyzeActivationQuality,
	classifyScheduleWindow,
	eligibleForWindow,
	executionDurationMinutes,
	hasReworkWithin,
	isRepeatedSupport,
} = require("./activationQualityRules");

const NOW = new Date("2026-10-01T12:00:00Z");

function base(overrides = {}) {
	return {
		id: "snap-1",
		order_type_id: 4,
		order_type_name: "INSTALAÇÃO",
		health_monitoring_mode: "FULL",
		scheduled_start_at: "2026-09-01T08:00:00Z",
		scheduled_end_at: "2026-09-01T10:00:00Z",
		executed_start_at: "2026-09-01T09:23:00Z",
		executed_end_at: "2026-09-01T11:00:00Z",
		connection_connected: true,
		connection_captured_at: "2026-10-01T10:00:00Z",
		download_gigabytes: 1,
		upload_gigabytes: 0.2,
		service_status: "Ativo",
		technician_match_status: "matched",
		support_events: [],
		...overrides,
	};
}

test("classifyScheduleWindow retorna ON_TIME, EARLY, LATE e NO_DATA", () => {
	assert.equal(classifyScheduleWindow(base()), "ON_TIME");
	assert.equal(classifyScheduleWindow(base({ executed_start_at: "2026-09-01T07:30:00Z" })), "EARLY");
	assert.equal(classifyScheduleWindow(base({ executed_start_at: "2026-09-01T10:37:00Z" })), "LATE");
	assert.equal(classifyScheduleWindow(base({ scheduled_start_at: null })), "NO_DATA");
});

test("executionDurationMinutes calcula duração quando inicio e fim existem", () => {
	assert.equal(executionDurationMinutes(base()), 97);
	assert.equal(executionDurationMinutes(base({ executed_end_at: null })), null);
});

test("eligibleForWindow não coloca OS nova no denominador D+30", () => {
	const recent = base({ executed_end_at: "2026-09-30T12:00:00Z" });
	assert.equal(eligibleForWindow(recent, 7, NOW), false);
	assert.equal(eligibleForWindow(recent, 30, NOW), false);
	const old = base({ executed_end_at: "2026-08-25T12:00:00Z" });
	assert.equal(eligibleForWindow(old, 30, NOW), true);
});

test("hasReworkWithin considera somente evento técnico comprovado dentro da janela", () => {
	const support = { openedAt: "2026-09-05T12:00:00Z", affectsActivationQuality: true };
	assert.equal(hasReworkWithin(base({ support_events: [support] }), 7), true);
	assert.equal(hasReworkWithin(base({ support_events: [{ ...support, openedAt: "2026-09-20T12:00:00Z" }] }), 7), false);
	assert.equal(hasReworkWithin(base({ support_events: [{ ...support, affectsActivationQuality: false }] }), 7), false);
});

test("isRepeatedSupport exige dois ou mais eventos técnicos reais", () => {
	const support = { openedAt: "2026-09-05T12:00:00Z", affectsActivationQuality: true };
	assert.equal(isRepeatedSupport(base({ support_events: [] })), false);
	assert.equal(isRepeatedSupport(base({ support_events: [support] })), false);
	assert.equal(isRepeatedSupport(base({ support_events: [support, { ...support, openedAt: "2026-09-06T12:00:00Z" }] })), true);
});

test("analyzeActivationQuality reúne janela, saúde, duração e denominadores", () => {
	const analyzed = analyzeActivationQuality(base(), { now: NOW });
	assert.equal(analyzed.scheduleStatus, "ON_TIME");
	assert.equal(analyzed.durationMinutes, 97);
	assert.equal(analyzed.windows.d7.eligible, true);
	assert.equal(analyzed.windows.d30.eligible, true);
	assert.equal(analyzed.health.healthStatus, "SAUDAVEL");
});
