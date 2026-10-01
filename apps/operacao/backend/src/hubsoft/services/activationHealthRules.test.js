const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateActivationHealth, resolveHealthWindow } = require("./activationHealthRules");

const NOW = new Date("2026-10-01T12:00:00Z");

function base(overrides = {}) {
	return {
		id: "snap-1",
		hubsoft_order_id: 123,
		order_number: "OS-123",
		order_type_id: 4,
		order_type_name: "INSTALAÇÃO",
		health_monitoring_mode: "FULL",
		executed_end_at: "2026-09-30T12:00:00Z",
		connection_connected: true,
		connection_captured_at: "2026-10-01T10:00:00Z",
		download_gigabytes: 0.5,
		upload_gigabytes: 0.1,
		service_status: "Ativo",
		technician_match_status: "matched",
		support_events: [],
		...overrides,
	};
}

test("resolveHealthWindow cobre D+1, D+7, D+15, D+30 e sem data", () => {
	assert.equal(resolveHealthWindow(null), "SEM_DATA");
	assert.equal(resolveHealthWindow(1), "D+1");
	assert.equal(resolveHealthWindow(7), "D+7");
	assert.equal(resolveHealthWindow(15), "D+15");
	assert.equal(resolveHealthWindow(30), "D+30");
	assert.equal(resolveHealthWindow(31), "FORA_DA_JANELA");
});

test("classifica ativação saudável com serviço ativo, conexão recente e tráfego", () => {
	const result = evaluateActivationHealth(base(), { now: NOW });
	assert.equal(result.healthStatus, "SAUDAVEL");
	assert.deepEqual(result.reasons, []);
});

test("classifica crítico quando não há conexão PPPoE", () => {
	const result = evaluateActivationHealth(base({ connection_connected: false }), { now: NOW });
	assert.equal(result.healthStatus, "CRITICO");
	assert.ok(result.reasons.includes("NO_CONNECTION"));
});

test("classifica atenção quando há sessão sem tráfego", () => {
	const result = evaluateActivationHealth(base({ download_gigabytes: 0, upload_gigabytes: 0 }), { now: NOW });
	assert.equal(result.healthStatus, "ATENCAO");
	assert.ok(result.reasons.includes("NO_TRAFFIC"));
});

test("classifica sem dados quando falta captura de conexão", () => {
	const result = evaluateActivationHealth(base({ connection_captured_at: null, connection_connected: null }), { now: NOW });
	assert.equal(result.healthStatus, "SEM_DADOS");
	assert.ok(result.reasons.includes("INSUFFICIENT_DATA"));
});

test("snapshot antigo vira atenção, não crítico automaticamente", () => {
	const result = evaluateActivationHealth(base({ connection_captured_at: "2026-09-29T08:00:00Z" }), { now: NOW });
	assert.equal(result.healthStatus, "ATENCAO");
	assert.ok(result.reasons.includes("STALE_CONNECTION_DATA"));
});

test("suporte técnico recente gera atenção e reincidência gera crítico", () => {
	const support = { openedAt: "2026-10-01T09:00:00Z", attendanceCategory: "TECHNICAL_CONNECTION", affectsActivationQuality: true };
	const one = evaluateActivationHealth(base({ support_events: [support] }), { now: NOW });
	assert.equal(one.healthStatus, "ATENCAO");
	assert.ok(one.reasons.includes("RECENT_SUPPORT"));

	const repeated = evaluateActivationHealth(base({ support_events: [support, { ...support, openedAt: "2026-10-01T11:00:00Z" }] }), { now: NOW });
	assert.equal(repeated.healthStatus, "CRITICO");
	assert.ok(repeated.reasons.includes("REPEATED_SUPPORT"));
});

test("suporte administrativo não conta como rechamado técnico", () => {
	const result = evaluateActivationHealth(base({
		support_events: [{ openedAt: "2026-10-01T09:00:00Z", attendanceCategory: "ADMINISTRATIVE", affectsActivationQuality: false }],
	}), { now: NOW });
	assert.equal(result.healthStatus, "SAUDAVEL");
	assert.equal(result.evidence.support.qualityCount, 0);
});

test("pendência cadastral isolada não altera saúde técnica", () => {
	const result = evaluateActivationHealth(base({
		technician_match_status: "unmatched",
		operacao_empresa_id: null,
		company_name: "",
		cidade_id: null,
		city_name: "",
		cidade_nome: "",
		brand: "UNKNOWN",
	}), { now: NOW });
	assert.equal(result.healthStatus, "SAUDAVEL");
	assert.deepEqual(result.reasons, []);
	assert.deepEqual(result.dataQualityIssues, ["TECHNICIAN_UNMATCHED", "COMPANY_UNMATCHED", "CITY_MISSING", "BRAND_UNKNOWN"]);
});

test("tráfego zerado com captura recém-criada aguarda observação mínima", () => {
	const result = evaluateActivationHealth(base({
		connection_captured_at: "2026-10-01T11:30:00Z",
		download_gigabytes: 0,
		upload_gigabytes: 0,
	}), { now: NOW });
	assert.equal(result.healthStatus, "SAUDAVEL");
	assert.ok(!result.reasons.includes("NO_TRAFFIC"));
});

test("modo limited não exige conexão tradicional e fica em atenção auditável", () => {
	const result = evaluateActivationHealth(base({
		order_type_id: 52,
		order_type_name: "INSTALAÇÃO CÂMERAS/ALARMES",
		health_monitoring_mode: "LIMITED",
		connection_connected: null,
	}), { now: NOW });
	assert.equal(result.healthStatus, "ATENCAO");
	assert.ok(result.reasons.includes("LIMITED_MONITORING"));
});
