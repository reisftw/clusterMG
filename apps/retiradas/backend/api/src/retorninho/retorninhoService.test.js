const assert = require("node:assert/strict");
const test = require("node:test");
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
const evolutionMessaging = require("../evolutionMessaging");
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

test("extrai a opção clicada em botões da Evolution", () => {
	const parsed = service._test.incomingMessage({
		instance: "retorninho-ia",
		data: {
			key: { id: "msg-button", remoteJid: "5531999991234@s.whatsapp.net" },
			message: { buttonsResponseMessage: { selectedButtonId: "2", selectedDisplayText: "Buscar oportunidades" } },
		},
	});
	assert.equal(parsed.body, "2");
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

test("reutiliza a Evolution protegida da Mensageria sem duplicar a chave", async (t) => {
	const originalGetConfig = evolutionMessaging.getConfig;
	t.after(() => { evolutionMessaging.getConfig = originalGetConfig; });
	evolutionMessaging.getConfig = async () => ({
		evolutionBaseUrl: "http://127.0.0.1:8080",
		evolutionApiKey: "segredo-somente-no-backend",
	});

	const config = await service._test.resolveEvolutionConfig({});
	assert.equal(config.evolutionBaseUrl, "http://127.0.0.1:8080");
	assert.equal(config.evolutionApiKey, "segredo-somente-no-backend");
	assert.equal(config.evolutionInstance, "retorninho-ia");
	assert.equal(config.configurationSource, "mensageria");
});

test("monta boas-vindas personalizadas com as funções disponíveis", () => {
	const morning = service._test.welcomeMessage("Rodrigo Reis", 9);
	const afternoon = service._test.welcomeMessage("Rodrigo Reis", 14);
	const evening = service._test.welcomeMessage("Rodrigo Reis", 20);

	assert.match(morning, /^Bom dia, Rodrigo!/);
	assert.match(afternoon, /^Boa tarde, Rodrigo!/);
	assert.match(evening, /^Boa noite, Rodrigo!/);
	assert.match(morning, /1\. Consultar O\.S\. ou cliente/);
	assert.match(morning, /6\. Consultar equipamento ou procedimento/);
});

test("resolve as opções numeradas do menu sem depender da IA externa", () => {
	assert.deepEqual(service._test.menuChoice("1"), {
		tool: "consultar_os",
		prompt: "Informe o número da O.S. ou o código do cliente.",
	});
	assert.equal(service._test.menuChoice("5").tool, "consultar_produtividade");
	assert.equal(service._test.menuChoice("opção inválida"), null);
	assert.deepEqual(
		service._test.pendingMenuArgs("buscar_oportunidades", "Uberlândia"),
		{ city: "Uberlândia" },
	);
});
