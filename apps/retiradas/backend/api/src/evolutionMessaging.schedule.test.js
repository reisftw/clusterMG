process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");
const { _test } = require("./evolutionMessaging");

test("aceita 17:00 como horário de agendamento", () => {
	assert.equal(_test.parseGuidedTimeChoice("17:00"), "17:00");
	assert.equal(_test.parseGuidedTimeChoice("pode ser às 17h"), "17:00");
});

test("não aceita horário após 17:59 no fluxo guiado", () => {
	assert.equal(_test.parseGuidedTimeChoice("18:00"), null);
});
