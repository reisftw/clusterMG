const assert = require("node:assert/strict");
const test = require("node:test");
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
const service = require("./retorninhoService");

test("extrai somente a mensagem recebida da instância Evolution", () => {
	const parsed = service._test.incomingMessage({
		instance: "retorninho-ia",
		data: {
			key: { id: "msg-1", remoteJid: "5531999991234@s.whatsapp.net", fromMe: false },
			message: { conversation: "Quero consultar a ordem" },
		},
	});
	assert.deepEqual(parsed, {
		instance: "retorninho-ia",
		messageId: "msg-1",
		fromMe: false,
		phone: "5531999991234",
		body: "Quero consultar a ordem",
		location: null,
		provider: "evolution",
	});
});

test("extrai localização recebida pela Evolution", () => {
	const parsed = service._test.incomingMessage({
		instance: "retorninho-ia",
		data: {
			key: { id: "msg-location", remoteJid: "5531999991234@s.whatsapp.net" },
			message: { locationMessage: { degreesLatitude: -19.92, degreesLongitude: -44.10 } },
		},
	});
	assert.deepEqual(parsed.location, { latitude: -19.92, longitude: -44.10 });
});

test("normaliza somente mensagens recebidas do webhook Meta", () => {
	const parsed = service._test.metaMessages({
		entry: [{ changes: [{ value: {
			metadata: { phone_number_id: "phone-1" },
			messages: [{ id: "wamid-1", from: "5531999991234", type: "text", text: { body: "Olá" } }],
		} }] }],
	});
	assert.equal(parsed.length, 1);
	assert.deepEqual(parsed[0], {
		provider: "meta", instance: "retorninho-ia", phoneNumberId: "phone-1",
		messageId: "wamid-1", fromMe: false, phone: "5531999991234", body: "Olá", location: null,
	});
});

test("deduplicação muda por instância e mensagem", () => {
	const base = { instance: "retorninho-ia", data: { key: { id: "msg-1" } } };
	assert.equal(service._test.webhookDedupe(base, "messages.upsert"), service._test.webhookDedupe(base, "messages.upsert"));
	assert.notEqual(service._test.webhookDedupe(base, "messages.upsert"), service._test.webhookDedupe({ ...base, instance: "outra" }, "messages.upsert"));
});

test("paginações são limitadas no backend", () => {
	assert.deepEqual(service._test.pageOf({ page: "2", limit: "5000" }), { page: 2, limit: 100, offset: 100 });
	assert.deepEqual(service._test.pageOf({ page: "-2", limit: "0" }), { page: 1, limit: 25, offset: 0 });
});
