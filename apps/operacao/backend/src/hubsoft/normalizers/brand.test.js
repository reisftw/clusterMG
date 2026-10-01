const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveHubsoftBrand } = require("./brand");

test("resolveHubsoftBrand resolve marcas por descricao de servico", () => {
	assert.deepEqual(resolveHubsoftBrand({ servico: { descricao: "SEMPRE PLAY | 600MB" } }), {
		brand: "SEMPRE",
		brandSource: "service_description",
	});
	assert.deepEqual(resolveHubsoftBrand({ servico: { descricao: "PME SEMPRE | 400MB" } }), {
		brand: "SEMPRE",
		brandSource: "service_description",
	});
	assert.deepEqual(resolveHubsoftBrand({ servico: { descricao: "[PROMO] ON UDI 400MB" } }), {
		brand: "ONNET",
		brandSource: "service_description",
	});
	assert.deepEqual(resolveHubsoftBrand({ servico: { descricao: "B2B | INTERNET PROTOCOL PPPOE" } }), {
		brand: "UNKNOWN",
		brandSource: "service_description",
	});
});
