// Adapter do provedor de IA do Warlinho — mesmo padrao e mesmo provedor
// do Financeirinho/Victorinho do Finan (apps/finan/backend/src/
// financeirinho/llmClient.js), reaproveitando a MESMA chave/conta Gemini
// (pedido explicito do usuario: "vamos utilizar a mesma IA") — so a
// variavel de ambiente muda de prefixo (ROT_ em vez de FINAN_), pro
// padrao de nomenclatura de env vars por app que o projeto ja segue.
// Interface exportada (`chat({ systemPrompt, history, tools })`) e
// generica de proposito: se um dia trocar de provedor, so este arquivo
// muda, nada que chama `chat()` (warlinho/routes.js) precisa saber qual
// provedor esta por baixo.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function resolveModel() {
	return process.env.ROT_GEMINI_MODEL || process.env.FINAN_GEMINI_MODEL || "gemini-3.6-flash";
}

function resolveApiKey() {
	return process.env.ROT_GEMINI_API_KEY || process.env.FINAN_GEMINI_API_KEY || "";
}

function isConfigured() {
	return Boolean(resolveApiKey());
}

// Converte o formato generico de historico ({role: "user"|"model", ...})
// que warlinho/routes.js monta pro formato especifico do Gemini
// (contents[].parts[]).
function toGeminiContents(history) {
	return history.map((entry) => ({
		role: entry.role,
		parts: entry.parts,
	}));
}

function toGeminiTools(tools) {
	if (!tools?.length) return undefined;
	return [
		{
			functionDeclarations: tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			})),
		},
	];
}

function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function callGeminiOnce({ systemPrompt, history, tools }) {
	const url = `${GEMINI_API_BASE}/models/${resolveModel()}:generateContent?key=${encodeURIComponent(resolveApiKey())}`;
	const body = {
		systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
		contents: toGeminiContents(history),
		tools: toGeminiTools(tools),
		generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
	};
	return fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/**
 * Faz 1 chamada ao modelo. Retorna:
 *   { type: "text", text }
 *   { type: "tool_call", name, args, thoughtSignature }
 * Lanca erro (com `.status`) se a chave nao estiver configurada ou a API
 * responder com erro — warlinho/routes.js decide como apresentar isso ao
 * usuario (nunca deixa vazar detalhe interno pro cliente).
 */
async function chat({ systemPrompt, history, tools }) {
	if (!isConfigured()) {
		const error = new Error("O Warlinho ainda não foi configurado (falta a chave de IA).");
		error.status = 503;
		throw error;
	}

	// O free tier do Gemini responde 503 ("high demand") com alguma
	// frequencia — 1 retry curto (sem retry pra 429, esse e limite de
	// cota mesmo) cobre a maioria dos casos sem o usuario precisar
	// reenviar a pergunta manualmente.
	let response = await callGeminiOnce({ systemPrompt, history, tools });
	if (response.status === 503) {
		await wait(1200);
		response = await callGeminiOnce({ systemPrompt, history, tools });
	}

	if (!response.ok) {
		const rawError = await response.text().catch(() => "");
		console.error(`[warlinho] Gemini respondeu ${response.status}: ${rawError.slice(0, 500)}`);
		const error = new Error(
			response.status === 429 || response.status === 503
				? "O Warlinho está sobrecarregado agora. Tenta de novo em instantes."
				: "Não consegui falar com o Warlinho agora.",
		);
		error.status = response.status === 429 || response.status === 503 ? 429 : 502;
		throw error;
	}

	const data = await response.json();
	const candidate = data?.candidates?.[0];
	const parts = candidate?.content?.parts || [];
	const functionCallPart = parts.find((part) => part.functionCall);
	if (functionCallPart) {
		// O Gemini 3.x exige devolver o mesmo `thoughtSignature` junto do
		// functionCall quando ele volta pro historico na proxima chamada
		// (sem isso, a API rejeita com 400 "missing thought_signature").
		return {
			type: "tool_call",
			name: functionCallPart.functionCall.name,
			args: functionCallPart.functionCall.args || {},
			thoughtSignature: functionCallPart.thoughtSignature,
		};
	}
	const text = parts.map((part) => part.text || "").join("").trim();
	return { type: "text", text: text || "Não consegui montar uma resposta agora." };
}

module.exports = { chat, isConfigured };
