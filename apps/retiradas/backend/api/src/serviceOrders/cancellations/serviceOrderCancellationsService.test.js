const assert = require("node:assert/strict");
const test = require("node:test");

const {
	_buildPublicCancellationCities,
	_mapHubsoftRow,
	_normalizeTechnology,
} = require("./serviceOrderCancellationsService");

test("classifica planos FIBER migrados como FTTH", () => {
	assert.equal(
		_normalizeTechnology({
			servico: "(Migrado - onnetpatrocinio) FIBER 1P - 400 MB - 99,90",
		}).classification,
		"FTTH",
	);
});

test("classifica planos de alta velocidade como FTTH sem confundir tecnologias legadas", () => {
	assert.equal(
		_normalizeTechnology({ servico: "SEMPRE PLUS | 300MB R$89,90" }).classification,
		"FTTH",
	);
	assert.equal(
		_normalizeTechnology({ servico: "COMBO WIRELESS RURAL 5MBPS" }).classification,
		"NAO_FTTH",
	);
	assert.equal(
		_normalizeTechnology({ servico: "B2B | LINK DEDICADO 500MB" }).classification,
		"NAO_FTTH",
	);
});

test("prioriza a calibragem manual do modelo nas sincronizacoes seguintes", () => {
	const row = { servico: "MODELO TESTE 300MB", data_cancelamento: "2026-11-10" };
	const mapped = _mapHubsoftRow(row, "2026-11", new Map(), {
		"MODELO TESTE 300MB": {
			classification: "NAO_FTTH",
			type: "Wireless",
		},
	});
	assert.equal(mapped.classificacaoTecnologia, "NAO_FTTH");
	assert.equal(mapped.tecnologiaOriginal, "Wireless");
});

test("consolida cancelamentos públicos por empresa, mês, cidade e regional", () => {
	const result = _buildPublicCancellationCities(
		[
			{
				competencia: "2026-01",
				cidade: "Patos de Minas",
				regional: "Noroeste de Minas",
				empresa: "SEMPRE",
				total: 12,
			},
			{
				competencia: "2026-02",
				cidade: "Patos de Minas",
				regional: "Noroeste de Minas",
				empresa: "ONNET",
				total: 4,
			},
			{
				competencia: "2026-01",
				cidade: "Uberlândia",
				regional: "Triângulo Mineiro",
				empresa: "SEMPRE",
				total: 7,
			},
		],
		2026,
		"2026-11-25T12:00:00.000Z",
	);

	assert.deepEqual(result.totals, {
		total: 23,
		sempre: 19,
		onnet: 4,
		cities: 2,
		regionals: 2,
		currentMonth: 0,
	});
	assert.equal(result.months[0].total, 19);
	assert.equal(result.months[1].onnet, 4);
	assert.equal(result.cities[0].cidade, "Patos de Minas");
	assert.equal(result.cities[0].total, 16);
	assert.equal(result.cities[0].mensal[1].onnet, 4);
});
