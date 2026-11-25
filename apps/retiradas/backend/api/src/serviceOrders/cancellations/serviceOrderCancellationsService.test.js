const assert = require("node:assert/strict");
const test = require("node:test");

const {
	_buildPublicCancellationCities,
} = require("./serviceOrderCancellationsService");

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
