// Adapter do provedor de IA do Financeirinho — hoje Google Gemini (free
// tier, ver apps/finan/.env.example), mas a interface exportada
// (`chat({ systemPrompt, history, tools })`) e generica de proposito: se
// um dia trocar de provedor, so este arquivo muda, nada que chama
// `chat()` (financeirinho/routes.js) precisa saber qual provedor esta por
// baixo.
//
// Usa fetch nativo (Node 18+, o Finan roda em Node 24 — ver CLAUDE.md) em
// vez de instalar um SDK novo: a API REST do Gemini e simples o bastante
// pra nao justificar mais uma dependencia.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function resolveModel() {
	return process.env.FINAN_GEMINI_MODEL || "gemini-3.6-flash";
}

function isConfigured() {
	return Boolean(process.env.FINAN_GEMINI_API_KEY);
}

// Converte o formato generico de historico ({role: "user"|"model", ...})
// que financeirinho/routes.js monta pro formato especifico do Gemini
// (contents[].parts[]). Cada entrada do historico e um dos 3 tipos:
// texto do usuario, texto/chamada de ferramenta do modelo, ou resultado
// de ferramenta (que o Gemini exige vir de volta como role "user").
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

/**
 * Faz 1 chamada ao modelo. Retorna:
 *   { type: "text", text }
 *   { type: "tool_call", name, args }
 * Lanca erro (com `.status`) se a chave nao estiver configurada ou a API
 * responder com erro — financeirinho/routes.js decide como apresentar
 * isso ao usuario (nunca deixa vazar detalhe interno pro cliente).
 */
function wait(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function callGeminiOnce({ systemPrompt, history, tools }) {
	const url = `${GEMINI_API_BASE}/models/${resolveModel()}:generateContent?key=${encodeURIComponent(process.env.FINAN_GEMINI_API_KEY)}`;
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

async function chat({ systemPrompt, history, tools }) {
	if (!isConfigured()) {
		const error = new Error("Victorinho ainda não foi configurado (falta a chave de IA).");
		error.status = 503;
		throw error;
	}

	// O free tier do Gemini responde 503 ("high demand") com alguma
	// frequencia — 1 retry curto (sem retry pra 429, esse e limite de
	// cota mesmo, tentar de novo na hora so piora) cobre a maioria dos
	// casos sem o usuario precisar reenviar a pergunta manualmente.
	let response = await callGeminiOnce({ systemPrompt, history, tools });
	if (response.status === 503) {
		await wait(1200);
		response = await callGeminiOnce({ systemPrompt, history, tools });
	}

	if (!response.ok) {
		// Nunca repassa o corpo cru da resposta de erro do Gemini pro
		// cliente (pode conter detalhe da chave/config) — so loga no
		// backend e sobe um erro generico.
		const rawError = await response.text().catch(() => "");
		console.error(`[financeirinho] Gemini respondeu ${response.status}: ${rawError.slice(0, 500)}`);
		const error = new Error(
			response.status === 429 || response.status === 503
				? "O Victorinho está sobrecarregado agora. Tenta de novo em instantes."
				: "Não consegui falar com o Victorinho agora.",
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
		// (sem isso, a API rejeita com 400 "missing thought_signature") —
		// so repassamos adiante, nunca inspecionamos o conteudo.
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
