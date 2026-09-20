// Warlinho — assistente com IA real (Gemini, ver llmClient.js), restrito
// aos dados da Operação via tool use (tools.js). Mesmo padrao do
// Financeirinho/Victorinho do Finan (financeirinho/routes.js), pro
// dominio de campo da Operação.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const db = require("../db");
const { requireRotAuth } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { randomId } = require("../secureRandom");
const { chat, isConfigured } = require("./llmClient");
const { buildAvailableTools, findTool } = require("./tools");

const router = express.Router();
router.use(requireRotAuth);
router.use(noStore);

// Rate limit por USUARIO (nao por IP) — a cota gratis do Gemini e
// compartilhada com o Finan (mesma chave), entao o limite que importa e
// "1 usuario nao consegue sozinho estourar a cota de todo mundo".
router.use(
	rateLimit({
		windowMs: 60 * 1000,
		limit: Number(process.env.ROT_WARLINHO_RATE_LIMIT || 30),
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: (req) => req.rotUser?.id || ipKeyGenerator(req.ip),
		message: { ok: false, error: "Muitas perguntas em pouco tempo. Espera um instante." },
	}),
);

const SYSTEM_PROMPT = `Você é o Warlinho, assistente de dados da Operação (Gestão Operacional de Campo da Sempre Internet).
Responda SOMENTE sobre os dados da Operação (chamados/tickets, plantões/escala, ausências/férias, feriados, agenda/atividades de campo, ranking de técnicos).
Use as ferramentas disponíveis para buscar dado real antes de responder — NUNCA invente número, nome ou data.
Se a busca não encontrar nada, diga claramente que não encontrou registro — não invente um motivo.
Se a pergunta não tiver relação com o Operação (ou pedir algo fora do que as ferramentas oferecem), recuse educadamente e explique que só ajuda com os dados da Operação.
Responda em português do Brasil, de forma direta e objetiva. NÃO use formatação markdown (sem **negrito**, sem listas com * ou -) — o chat mostra texto puro; para listar itens, separe por vírgula ou por linha simples.`;

const MAX_TOOL_ITERATIONS = 4;

function publicMensagem(row) {
	const toolCalls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
	return {
		id: row.id,
		papel: row.papel,
		conteudo: row.conteudo,
		createdAt: row.created_at,
		ferramentasUsadas: toolCalls.map((call) => call.name).filter(Boolean),
	};
}

async function ensureConversa(rotUser, conversaId) {
	if (conversaId) {
		const { rows } = await db.query(`select * from rot_warlinho_conversas where id = $1 and user_id = $2`, [conversaId, rotUser.id]);
		if (rows[0]) return rows[0];
	}
	const id = randomId("wchat");
	const { rows } = await db.query(`insert into rot_warlinho_conversas (id, user_id) values ($1, $2) returning *`, [id, rotUser.id]);
	return rows[0];
}

function canReadMensagem(row, rotUser) {
	const allowed = new Set(buildAvailableTools(rotUser).map(tool => tool.name));
	return (Array.isArray(row.tool_calls) ? row.tool_calls : []).every(call => allowed.has(call.name));
}

async function loadHistoryAsGeminiContents(conversaId, rotUser) {
	const { rows } = await db.query(
		`select papel, conteudo, tool_calls from rot_warlinho_mensagens where conversa_id = $1 order by created_at asc limit 40`,
		[conversaId],
	);
	return rows.filter(row => canReadMensagem(row, rotUser)).map((row) => ({
		role: row.papel === "usuario" ? "user" : "model",
		parts: [{ text: row.conteudo }],
	}));
}

async function saveMensagem(conversaId, papel, conteudo, toolCalls = []) {
	await db.query(
		`insert into rot_warlinho_mensagens (id, conversa_id, papel, conteudo, tool_calls) values ($1, $2, $3, $4, $5::jsonb)`,
		[randomId("wmsg"), conversaId, papel, conteudo, JSON.stringify(toolCalls)],
	);
	await db.query(`update rot_warlinho_conversas set updated_at = now() where id = $1`, [conversaId]);
}

async function auditToolCall(req, { conversaId, name, args, status }) {
	await db.query(
		`insert into rot_audit_logs (user_id, user_name, action, entity, entity_id, after_data, ip_address, user_agent)
		values ($1,$2,'warlinho_tool_call','rot_warlinho_conversas',$3,$4::jsonb,$5,$6)`,
		[
			req.rotUser?.id || null,
			req.rotUser?.name || null,
			conversaId,
			JSON.stringify({
				tool: String(name || ""),
				status: String(status || ""),
				args: Object.fromEntries(
					Object.entries(args || {}).map(([key, value]) => [key, String(value ?? "").slice(0, 120)]),
				),
			}),
			String(req.ip || ""),
			String(req.get?.("user-agent") || "").slice(0, 500),
		],
	).catch((error) => console.warn("[warlinho] falha ao auditar tool:", error?.message || error));
}

router.get("/conversas", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, titulo, updated_at from rot_warlinho_conversas where user_id = $1 order by updated_at desc limit 20`,
			[req.rotUser.id],
		);
		res.json({ ok: true, conversas: rows.map((row) => ({ id: row.id, titulo: row.titulo, updatedAt: row.updated_at })) });
	} catch (error) {
		next(error);
	}
});

router.get("/conversas/:conversaId", async (req, res, next) => {
	try {
		const { rows: conversaRows } = await db.query(`select id from rot_warlinho_conversas where id = $1 and user_id = $2`, [
			req.params.conversaId,
			req.rotUser.id,
		]);
		if (!conversaRows[0]) {
			res.status(404).json({ ok: false, error: "Conversa não encontrada." });
			return;
		}
		const { rows } = await db.query(`select * from rot_warlinho_mensagens where conversa_id = $1 order by created_at asc`, [
			req.params.conversaId,
		]);
		res.json({ ok: true, mensagens: rows.filter(row => canReadMensagem(row, req.rotUser)).map(publicMensagem) });
	} catch (error) {
		next(error);
	}
});

router.post("/chat", async (req, res, next) => {
	try {
		if (!isConfigured()) {
			res.status(503).json({ ok: false, error: "O Warlinho ainda não foi configurado. Fala com o time de TI." });
			return;
		}
		const mensagem = String(req.body?.mensagem || "").trim();
		if (!mensagem || mensagem.length > 2000) {
			res.status(400).json({ ok: false, error: "Informe uma mensagem de até 2000 caracteres." });
			return;
		}
		const conversaId = req.body?.conversaId ? String(req.body.conversaId) : "";

		const conversa = await ensureConversa(req.rotUser, conversaId);
		await saveMensagem(conversa.id, "usuario", mensagem);

		const tools = buildAvailableTools(req.rotUser);
		const history = await loadHistoryAsGeminiContents(conversa.id, req.rotUser);
		const toolCallsUsados = [];

		let resultado;
		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			// eslint-disable-next-line no-await-in-loop
			resultado = await chat({ systemPrompt: SYSTEM_PROMPT, history, tools });
			if (resultado.type === "text") break;

			const tool = tools.some((t) => t.name === resultado.name) ? findTool(resultado.name) : null;
			const modelPart = { functionCall: { name: resultado.name, args: resultado.args } };
			if (resultado.thoughtSignature) modelPart.thoughtSignature = resultado.thoughtSignature;
			history.push({ role: "model", parts: [modelPart] });

			let toolResult;
			try {
				// eslint-disable-next-line no-await-in-loop
				toolResult = tool ? await tool.handler(req, resultado.args) : { erro: "Ferramenta não disponível." };
				// eslint-disable-next-line no-await-in-loop
				await auditToolCall(req, { conversaId: conversa.id, name: resultado.name, args: resultado.args, status: tool ? "ok" : "unavailable" });
			} catch (toolError) {
				console.error(`[warlinho] erro na tool ${resultado.name}:`, toolError.message);
				toolResult = { erro: "Não consegui buscar esse dado agora." };
				// eslint-disable-next-line no-await-in-loop
				await auditToolCall(req, { conversaId: conversa.id, name: resultado.name, args: resultado.args, status: `error:${toolError.status || 500}` });
			}
			toolCallsUsados.push({ name: resultado.name, args: resultado.args });
			history.push({ role: "user", parts: [{ functionResponse: { name: resultado.name, response: toolResult } }] });
		}

		const respostaFinal = resultado?.type === "text" ? resultado.text : "Não consegui concluir a resposta agora — tenta reformular a pergunta.";
		await saveMensagem(conversa.id, "assistente", respostaFinal, toolCallsUsados);

		res.json({ ok: true, conversaId: conversa.id, resposta: respostaFinal, ferramentasUsadas: toolCallsUsados.map((t) => t.name) });
	} catch (error) {
		if (error.status) {
			res.status(error.status).json({ ok: false, error: error.message });
			return;
		}
		next(error);
	}
});

module.exports = router;
