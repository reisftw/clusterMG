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
