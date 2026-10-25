const assert = require("node:assert/strict");
const test = require("node:test");
const {
	__testables,
	createMetaCloudProvider,
} = require("./metaCloudProvider");

test("sanitiza tokens e segredos de respostas e erros", () => {
	assert.deepEqual(
		__testables.sanitizePayload({
			access_token: "token",
			nested: { appSecret: "secret", value: "ok" },
		}),
		{
			access_token: "[REDACTED]",
			nested: { appSecret: "[REDACTED]", value: "ok" },
		},
	);
});

test("não permite chamada sem Access Token seguro", async () => {
	const provider = createMetaCloudProvider({ graphApiVersion: "v26.0" });
	await assert.rejects(() => provider.validateWaba("123"), /META_ACCESS_TOKEN/);
});

test("não repete POST de envio e monta template oficial", async () => {
	const originalFetch = global.fetch;
	let calls = 0;
	let sentBody = null;
	global.fetch = async (_url, options) => {
		calls += 1;
		sentBody = JSON.parse(options.body);
		return { ok: true, status: 200, text: async () => '{"messages":[{"id":"wamid.1"}]}' };
	};
	try {
		const provider = createMetaCloudProvider({
			accessToken: "token-test",
			graphApiVersion: "v26.0",
		});
		await provider.sendTemplate({
			phoneNumberId: "123",
			to: "+55 31 99999-0000",
			template: "hello_world",
			language: "en_US",
			variables: [],
		});
		assert.equal(calls, 1);
		assert.equal(sentBody.messaging_product, "whatsapp");
		assert.equal(sentBody.to, "5531999990000");
		assert.equal(sentBody.template.name, "hello_world");
	} finally {
		global.fetch = originalFetch;
	}
});

test("envia até três botões interativos com identificadores estáveis", async () => {
	const originalFetch = global.fetch;
	let sentBody = null;
	global.fetch = async (_url, options) => {
		sentBody = JSON.parse(options.body);
		return { ok: true, status: 200, text: async () => '{"messages":[{"id":"wamid.buttons"}]}' };
	};
	try {
		const provider = createMetaCloudProvider({
			accessToken: "token-test",
			graphApiVersion: "v26.0",
		});
		await provider.sendInteractiveButtons({
			phoneNumberId: "123",
			to: "+55 31 99999-0000",
			body: "Escolha uma opção",
			buttons: [
				{ id: "flow:schedule", title: "Agendar" },
				{ id: "flow:delivered", title: "Já entregue" },
				{ id: "flow:support", title: "Falar com suporte" },
			],
		});
		assert.equal(sentBody.type, "interactive");
		assert.equal(sentBody.interactive.action.buttons.length, 3);
		assert.equal(sentBody.interactive.action.buttons[0].reply.id, "flow:schedule");
	} finally {
		global.fetch = originalFetch;
	}
});
