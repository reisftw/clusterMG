const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapOrderChanged } = require("./mapOrderComparison");

test("ignora diferencas apenas de formato nas datas do mapa", () => {
	const current = {
		num_os: "014326296091701650",
		data_cadastro: new Date("2026-10-23T09:17:01.000Z"),
		data_abertura_os: "2026-10-23T09:17:01.000Z",
		telefones: ["31999673328", "31911112222"],
	};
	const incoming = {
		num_os: "014326296091701650",
		data_cadastro: "2026-10-23 09:17:01",
		data_abertura_os: "23/10/2026 09:17:01",
		telefones: ["31911112222", "31999673328"],
	};

	assert.equal(mapOrderChanged(current, incoming), false);
});

test("detecta alteracao operacional real na ordem", () => {
	const current = {
		num_os: "1",
		status: "Pendente",
		telefone: "31999999999",
	};
	const incoming = {
		...current,
		status: "Aguardando Agendamento",
	};

	assert.equal(mapOrderChanged(current, incoming), true);
});
