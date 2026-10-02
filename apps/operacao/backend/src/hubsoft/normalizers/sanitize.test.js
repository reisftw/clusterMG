const assert = require("node:assert/strict");
const test = require("node:test");
const { sanitizeHubsoftPayload } = require("./sanitize");

test("sanitizeHubsoftPayload remove dados pessoais e preserva chaves tecnicas", () => {
	const sanitized = sanitizeHubsoftPayload({
		cpf: "12345678900",
		telefone_primario: "31999999999",
		email: "cliente@example.com",
		token: "secret",
		endereco: "Rua X",
		nasipaddress: "10.0.0.1",
		mac_addr: "AABBCCDDEEFF",
		servico: { descricao: "SEMPRE 600MB" },
	});
	assert.equal(sanitized.cpf, "<masked>");
	assert.equal(sanitized.telefone_primario, "<masked>");
	assert.equal(sanitized.email, "<masked>");
	assert.equal(sanitized.token, "<masked>");
	assert.equal(sanitized.endereco, "<masked>");
	assert.equal(sanitized.nasipaddress, "10.0.0.1");
	assert.equal(sanitized.mac_addr, "AABBCCDDEEFF");
	assert.equal(sanitized.servico.descricao, "SEMPRE 600MB");
});

test("sanitizeHubsoftPayload remove caracteres de controle rejeitados pelo jsonb", () => {
	const sanitized = sanitizeHubsoftPayload({ status: "OK\u0000TESTE\u0007" });
	assert.equal(sanitized.status, "OKTESTE");
});
