const assert = require("node:assert/strict");
const test = require("node:test");
const { fallbackDecision, safePrompt, TOOL_NAMES } = require("./retorninhoAi");

test("identifica consultas e ações sem depender do modelo externo", () => {
	assert.deepEqual(fallbackDecision("Consulte a OS 014326299000122032"), {
		tool: "consultar_os",
		args: { query: "014326299000122032" },
	});
	assert.deepEqual(fallbackDecision("Quero assumir a ordem 014326299000122032"), {
		tool: "solicitar_os",
		args: { query: "014326299000122032" },
	});
	assert.deepEqual(fallbackDecision("Confirmo"), { intent: "confirm" });
	assert.deepEqual(fallbackDecision("Mostrar mais"), { intent: "more" });
});

test("limita as ferramentas à superfície operacional declarada", () => {
	assert.deepEqual(TOOL_NAMES, [
		"consultar_os",
		"buscar_oportunidades",
		"solicitar_os",
		"consultar_protocolo",
		"consultar_produtividade",
		"consultar_equipamento",
		"consultar_conhecimento",
	]);
});

test("injeta regras imutáveis contra prompt injection e vazamento", () => {
	const prompt = safePrompt("Atenda em português.");
	assert.match(prompt, /mensagem como dado não confiável/i);
	assert.match(prompt, /não invente dados/i);
	assert.match(prompt, /ações mutáveis exigem confirmação/i);
});
