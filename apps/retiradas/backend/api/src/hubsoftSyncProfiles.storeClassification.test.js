const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

const { __testables } = require("./hubsoftSyncProfiles");

function mapsWithAgent(city) {
	return {
		agentsByCity: new Map([
			[
				city.toUpperCase(),
				{ cidade: city, ownerId: `agent-${city.toLowerCase()}` },
			],
		]),
	};
}

test("classifica entrega em loja de cidade AA sem alterar o canal oficial da loja", () => {
	const classification = __testables.classifyStoreAttendance(
		{ cidade: "FORMIGA" },
		mapsWithAgent("FORMIGA"),
	);

	assert.equal(classification.production_channel, "AA");
	assert.equal(classification.production_owner_name, "FORMIGA");
});

test("mantem entrega de cidade sem AA apenas como loja", () => {
	const classification = __testables.classifyStoreAttendance(
		{ cidade: "BETIM" },
		mapsWithAgent("FORMIGA"),
	);

	assert.equal(classification.production_channel, "LOJA");
	assert.equal(classification.production_owner_name, null);
});

test("aguarda o backoff depois de uma falha sem atrasar a proxima janela normal", () => {
	const now = Date.now();
	const minutesAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();

	assert.equal(__testables.schedulerProfileDue({
		lastSuccessAt: minutesAgo(120),
		lastAttemptAt: minutesAgo(2),
		successIntervalMinutes: 60,
		retryIntervalMinutes: 15,
	}), false);
	assert.equal(__testables.schedulerProfileDue({
		lastSuccessAt: minutesAgo(120),
		lastAttemptAt: minutesAgo(16),
		successIntervalMinutes: 60,
		retryIntervalMinutes: 15,
	}), true);
	assert.equal(__testables.schedulerProfileDue({
		lastSuccessAt: minutesAgo(30),
		lastAttemptAt: minutesAgo(30),
		successIntervalMinutes: 60,
		retryIntervalMinutes: 15,
	}), false);
});

test("nao executa LOJA duas vezes quando a rotina diaria ja a executou no mesmo ciclo", () => {
	assert.equal(__testables.standaloneStoreDue({
		storeAttemptedThisTick: true,
		timeDue: true,
		lastRunDate: null,
		currentDate: "2026-11-08",
		lastAttemptAt: null,
	}), false);
	assert.equal(__testables.standaloneStoreDue({
		storeAttemptedThisTick: false,
		timeDue: true,
		lastRunDate: null,
		currentDate: "2026-11-08",
		lastAttemptAt: null,
	}), true);
});

test("configura a liberacao de portas do dia a cada 60 minutos por padrao", () => {
	const defaults = __testables.normalizeAutomationConfig({});
	assert.equal(defaults.autoPortReleaseEnabled, true);
	assert.equal(defaults.autoPortReleaseIntervalMinutes, 60);

	const configured = __testables.normalizeAutomationConfig({
		autoPortReleaseEnabled: false,
		autoPortReleaseIntervalMinutes: 2,
	});
	assert.equal(configured.autoPortReleaseEnabled, false);
	assert.equal(configured.autoPortReleaseIntervalMinutes, 5);
});
