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
