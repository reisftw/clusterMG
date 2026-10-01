const assert = require("node:assert/strict");
const test = require("node:test");
const { parsePlanSpeedMbps } = require("./speed");

test("parsePlanSpeedMbps interpreta planos em MB e GB", () => {
	assert.equal(parsePlanSpeedMbps("SEMPRE | 600MB"), 600);
	assert.equal(parsePlanSpeedMbps("COMBO FIBRA OPTICA 800MBPS"), 800);
	assert.equal(parsePlanSpeedMbps("SEMPRE GAMER | 1GB"), 1000);
	assert.equal(parsePlanSpeedMbps("1 GBPS dedicado"), 1000);
	assert.equal(parsePlanSpeedMbps("texto sem velocidade"), null);
});
