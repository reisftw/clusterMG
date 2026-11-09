const assert = require("node:assert/strict");
const test = require("node:test");
const security = require("./retorninhoSecurity");

test("normaliza, mascara e cria candidatos brasileiros sem expor o telefone", () => {
	assert.equal(security.normalizePhone("(31) 99999-1234"), "+5531999991234");
	assert.equal(security.maskPhone("+5531999991234"), "+55 31 *****-1234");
	assert.equal(security.phoneHashes("+5531999991234").length, 2);
	assert.throws(() => security.normalizePhone("123"), /telefone válido/i);
});

test("criptografa segredos com autenticação e AAD", () => {
	const previous = process.env.APP_AUTH_SECRET;
	const previousId = process.env.APP_AUTH_SECRET_ID;
	process.env.APP_AUTH_SECRET = "test-secret-with-at-least-24-characters";
	process.env.APP_AUTH_SECRET_ID = "test";
	try {
		const encrypted = security.encrypt("RETORNINHO_AI_API_KEY", "gemini-secret");
		assert.notEqual(encrypted.ciphertext, "gemini-secret");
		assert.equal(security.decrypt("RETORNINHO_AI_API_KEY", encrypted), "gemini-secret");
		assert.throws(() => security.decrypt("OUTRO_SEGREDO", encrypted));
	} finally {
		if (previous === undefined) delete process.env.APP_AUTH_SECRET;
		else process.env.APP_AUTH_SECRET = previous;
		if (previousId === undefined) delete process.env.APP_AUTH_SECRET_ID;
		else process.env.APP_AUTH_SECRET_ID = previousId;
	}
});
