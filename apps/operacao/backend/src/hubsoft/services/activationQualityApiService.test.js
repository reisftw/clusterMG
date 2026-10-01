const assert = require("node:assert/strict");
const test = require("node:test");
const qualityService = require("./activationQualityApiService");

function row(index, overrides = {}) {
	const day = String(index + 1).padStart(2, "0");
	return {
		id: `snap-${index}`,
		hubsoft_order_id: 1000 + index,
		order_number: `OS-${index}`,
		order_type_id: 4,
		order_type_name: "INSTALAÇÃO",
		health_monitoring_mode: "FULL",
		scheduled_start_at: `2026-09-${day}T08:00:00Z`,
		scheduled_end_at: `2026-09-${day}T10:00:00Z`,
		executed_start_at: `2026-09-${day}T09:00:00Z`,
		executed_end_at: `2026-09-${day}T10:00:00Z`,
		connection_connected: true,
		connection_captured_at: "2026-10-01T10:00:00Z",
		download_gigabytes: 1,
		upload_gigabytes: 0.2,
		service_status: "Ativo",
		technician_match_status: "matched",
		operacao_tecnico_id: "tech-1",
		technician_name: "Tecnico Um",
		operacao_empresa_id: "emp-1",
		company_name: "Empresa Um",
		cidade_id: "city-1",
		city_name: "Betim",
		brand: "SEMPRE",
		support_events: [],
		...overrides,
	};
}

function fakeDb(rows, supportTotal = 0) {
	return {
		async query(sql) {
			if (String(sql).includes("hubsoft_activation_support_events") && String(sql).includes("count(*)")) {
				return { rows: [{ total: supportTotal }] };
			}
			return { rows };
		},
	};
}

test("detail pagina OS auditáveis sem carregar tudo de uma vez", async () => {
	const rows = Array.from({ length: 60 }, (_, index) => row(index));
	const data = await qualityService.detail(fakeDb(rows), {
		dimension: "technician",
		id: "tech-1",
		page: 2,
		limit: 25,
	});
	assert.equal(data.items.length, 25);
	assert.deepEqual(data.pagination, { page: 2, limit: 25, total: 60, totalPages: 3 });
	assert.equal(data.group.metrics.production.completed, 60);
});

test("detail aplica busca e filtro de janela no servidor", async () => {
	const rows = [
		row(1, { order_number: "OS-ALVO", executed_start_at: "2026-09-02T11:00:00Z" }),
		row(2, { order_number: "OS-OUTRA" }),
	];
	const data = await qualityService.detail(fakeDb(rows), {
		dimension: "technician",
		id: "tech-1",
		search: "alvo",
		scheduleStatus: "LATE",
		page: 1,
		limit: 25,
	});
	assert.equal(data.items.length, 1);
	assert.equal(data.items[0].orderNumber, "OS-ALVO");
	assert.equal(data.items[0].scheduleStatus, "LATE");
});

test("summary sinaliza fonte de rechamados indisponível sem transformar em zero confiável", async () => {
	const data = await qualityService.summary(fakeDb([row(1)], 0));
	assert.equal(data.supportSource.available, false);
	assert.equal(data.supportSource.reason, "SUPPORT_SOURCE_NOT_POPULATED");
	assert.equal(data.metrics.rework.d7.rate, 0);
});
