const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveActivationOperationalStatus } = require("./activationOperationalStatus");

test("resolveActivationOperationalStatus mapeia pendente, executando, aprovação e concluída", () => {
	assert.equal(resolveActivationOperationalStatus({ status: "pendente" }).id, "to_schedule");
	assert.equal(resolveActivationOperationalStatus({ status: "aguardando_aprovacao" }).id, "approval_pending");
	assert.equal(resolveActivationOperationalStatus({ executando: true, status: "pendente" }).id, "in_progress");
	assert.equal(resolveActivationOperationalStatus({ status: "finalizado", executed_end_at: "2026-09-30T12:00:00Z", closure_reason_name: "CONCLUÍDA" }).id, "completed");
	assert.equal(resolveActivationOperationalStatus({ status: "finalizado", executed_end_at: "2026-09-30T12:00:00Z", closure_reason_id: 135, closure_reason_name: "Outro texto" }).id, "completed");
	assert.equal(resolveActivationOperationalStatus({ status: "finalizado", executed_end_at: "2026-09-30T12:00:00Z", closure_reason_name: "CLIENTE AUSENTE" }).id, "to_validate");
	assert.equal(resolveActivationOperationalStatus({ executed_end_at: "2026-09-30T12:00:00Z", closure_reason_name: "TRATATIVA INTERNA" }).id, "to_validate");
});
