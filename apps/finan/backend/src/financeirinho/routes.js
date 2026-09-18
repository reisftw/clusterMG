// Financeirinho v2 — assistente com IA real (Gemini, ver llmClient.js),
// restrito aos dados do Finan via tool use (tools.js). Substitui o
// catalogo fechado de regex do #23 antigo (insights/routes.js, mantido
// intacto — os "insights proativos" continuam vindo de la).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { object, string, id: idField } = require("../dtos/schema");
const { chat, isConfigured } = require("./llmClient");
const { buildAvailableTools, findTool } = require("./tools");

const router = express.Router();

router.use(requireFinanPermission("finan.dashboard.view"));
router.use(noStore);

// Rate limit por USUARIO (nao por IP) — a cota gratis do Gemini e
// compartilhada por toda a aplicacao, entao o limite que importa e "1
// usuario nao consegue sozinho estourar a cota de todo mundo", nao so
// "1 IP".
router.use(
	rateLimit({
		windowMs: 60 * 1000,
		limit: Number(process.env.FINAN_FINANCEIRINHO_RATE_LIMIT || 30),
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: (req) => req.finanUser?.id || ipKeyGenerator(req.ip),
		message: { ok: false, error: "Muitas perguntas em pouco tempo. Espera um instante." },
	}),
);

const SYSTEM_PROMPT = `Você é o Victorinho, assistente de dados do sistema Finan (gestão financeira da Sempre Internet).
Responda SOMENTE sobre os dados financeiros do Finan (contas a pagar/receber, notas fiscais, fornecedores, pendências, indicadores, orçamento).
Use as ferramentas disponíveis para buscar dado real antes de responder — NUNCA invente número, valor ou nome.
Quando a pergunta mencionar um fornecedor, cliente ou assunto específico (ex: "quanto pagamos para a Cemig", "notas da Vivo"), SEMPRE use o parâmetro "busca" da ferramenta correspondente (consultarContasAPagar, consultarContasAReceber, consultarNotasFiscais) com esse nome — não tente adivinhar ou filtrar sem chamar a ferramenta de novo com esse filtro.
Se a busca não encontrar nada, diga claramente que não encontrou registro para aquele nome — não invente um motivo.
Se a pergunta não tiver relação com o Finan (ou pedir algo fora do que as ferramentas oferecem), recuse educadamente e explique que só ajuda com os dados do Finan.
Responda em português do Brasil, de forma direta e objetiva, formatando valores em R$ quando fizer sentido.`;

const MAX_TOOL_ITERATIONS = 4;

const ChatDTO = object(
	{
		mensagem: string({ required: true, minLength: 1, maxLength: 2000 }),
		conversaId: string({ maxLength: 64 }),
	},
	{ unknownKeys: "reject" },
);
const ConversaIdParamDTO = object({ conversaId: idField({ required: true }) }, { unknownKeys: "strip" });

function publicMensagem(row) {
	const toolCalls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
	return {
		id: row.id,
		papel: row.papel,
		conteudo: row.conteudo,
		createdAt: row.created_at,
		// Mesmo formato que POST /chat devolve na hora — reabrir uma
		// conversa antiga (GET /conversas/:id) mantém os chips de
		// "fonte"/CTA no frontend (ver FinanceirinhoLauncher.jsx).
		ferramentasUsadas: toolCalls.map((call) => call.name).filter(Boolean),
	};
}

async function ensureConversa(user, conversaId) {
	if (conversaId) {
		const { rows } = await db.query(`select * from finan_financeirinho_conversas where id = $1 and user_id = $2`, [conversaId, user.id]);
		if (rows[0]) return rows[0];
	}
	const id = randomId("fchat");
	const { rows } = await db.query(
		`insert into finan_financeirinho_conversas (id, user_id) values ($1, $2) returning *`,
		[id, user.id],
	);
	return rows[0];
}

async function loadHistoryAsGeminiContents(conversaId) {
	const { rows } = await db.query(
		`select papel, conteudo from finan_financeirinho_mensagens where conversa_id = $1 order by created_at asc limit 40`,
		[conversaId],
	);
	return rows.map((row) => ({
		role: row.papel === "usuario" ? "user" : "model",
		parts: [{ text: row.conteudo }],
	}));
}

async function saveMensagem(conversaId, papel, conteudo, toolCalls = []) {
	await db.query(
		`insert into finan_financeirinho_mensagens (id, conversa_id, papel, conteudo, tool_calls) values ($1, $2, $3, $4, $5::jsonb)`,
		[randomId("fmsg"), conversaId, papel, conteudo, JSON.stringify(toolCalls)],
	);
	await db.query(`update finan_financeirinho_conversas set updated_at = now() where id = $1`, [conversaId]);
}

router.get("/conversas", async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, titulo, updated_at from finan_financeirinho_conversas where user_id = $1 order by updated_at desc limit 20`,
			[req.finanUser.id],
		);
		res.json({ ok: true, conversas: rows.map((row) => ({ id: row.id, titulo: row.titulo, updatedAt: row.updated_at })) });
	} catch (error) {
		next(error);
	}
});

router.get("/conversas/:conversaId", validate({ params: ConversaIdParamDTO }), async (req, res, next) => {
	try {
		const { rows: conversaRows } = await db.query(
			`select id from finan_financeirinho_conversas where id = $1 and user_id = $2`,
			[req.validated.params.conversaId, req.finanUser.id],
		);
		if (!conversaRows[0]) {
			res.status(404).json({ ok: false, error: "Conversa não encontrada." });
			return;
		}
		const { rows } = await db.query(
			`select * from finan_financeirinho_mensagens where conversa_id = $1 order by created_at asc`,
			[req.validated.params.conversaId],
		);
		res.json({ ok: true, mensagens: rows.map(publicMensagem) });
	} catch (error) {
		next(error);
	}
});

router.post("/chat", validate({ body: ChatDTO }), async (req, res, next) => {
	try {
		if (!isConfigured()) {
			res.status(503).json({ ok: false, error: "O Victorinho ainda não foi configurado. Fala com o time de TI." });
			return;
		}

		const user = req.finanUser;
		const { mensagem, conversaId } = req.validated.body;
		const conversa = await ensureConversa(user, conversaId);
		await saveMensagem(conversa.id, "usuario", mensagem);

		const tools = buildAvailableTools(user);
		const history = await loadHistoryAsGeminiContents(conversa.id);
		const toolCallsUsados = [];

		let resultado;
		for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
			// eslint-disable-next-line no-await-in-loop
			resultado = await chat({ systemPrompt: SYSTEM_PROMPT, history, tools });
			if (resultado.type === "text") break;

			// Modelo pediu uma ferramenta — so executa se ela estiver na
			// lista permitida pra este usuario (defesa em profundidade: o
			// Gemini so deveria pedir o que foi oferecido, mas nunca confia
			// cegamente em nome vindo da resposta do modelo).
			const tool = tools.some((t) => t.name === resultado.name) ? findTool(resultado.name) : null;
			// thoughtSignature: o Gemini 3.x rejeita (400) a proxima chamada se
			// o functionCall devolvido no historico nao carregar o mesmo
			// thoughtSignature que veio na resposta original — so repassamos
			// adiante como veio, sem inspecionar (ver llmClient.js).
			const modelPart = { functionCall: { name: resultado.name, args: resultado.args } };
			if (resultado.thoughtSignature) modelPart.thoughtSignature = resultado.thoughtSignature;
			history.push({ role: "model", parts: [modelPart] });
			let toolResult;
			try {
				toolResult = tool ? await tool.handler(user, resultado.args) : { erro: "Ferramenta não disponível." };
			} catch (toolError) {
				console.error(`[financeirinho] erro na tool ${resultado.name}:`, toolError.message);
				toolResult = { erro: "Não consegui buscar esse dado agora." };
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
