// Roteiro Finan #45 (Fase 4E — Briefing Executivo automático, reúne
// #44, #43, #18 e #1): resumo diário/semanal/mensal pronto pra levar a
// uma reunião — mesmo padrão determinístico do #1 (texto fixo, sem
// custo de IA por chamada, como o próprio roteiro recomenda; uma camada
// de linguagem natural tipo Victorinho fica como v2 opcional).
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();

router.use(requireFinanPermission(["finan.dashboard.view", "finan.gestao_orcamentaria.view"]));
router.use(noStore);

function formatBRL(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateRangeForPeriodo(periodo) {
	const now = new Date();
	const hojeStr = now.toISOString().slice(0, 10);
	if (periodo === "diario") return { inicio: hojeStr, fim: hojeStr, label: `hoje (${hojeStr})` };
	if (periodo === "semanal") {
		const inicio = new Date(now);
		inicio.setDate(inicio.getDate() - 6);
		const inicioStr = inicio.toISOString().slice(0, 10);
		return { inicio: inicioStr, fim: hojeStr, label: `últimos 7 dias (${inicioStr} a ${hojeStr})` };
	}
	// mensal (padrao)
	const inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
	return { inicio, fim: hojeStr, ano: now.getFullYear(), mes: now.getMonth() + 1, label: `este mês` };
}

// Reune #1 (Finan Insights) — reaproveita as mesmas frases determinísticas
// já existentes em insights/routes.js pra "riscos", sem duplicar a lógica.
// eslint-disable-next-line global-require
const { buildInsights } = require("../insights/routes");

async function buildBriefing(periodo) {
	const range = dateRangeForPeriodo(periodo);
	const now = new Date();
	const ano = range.ano || now.getFullYear();
	const mes = range.mes || now.getMonth() + 1;

	const [totaisPeriodo, orcamentoMes, metas] = await Promise.all([
		db.query(
			`select
				coalesce(sum(realizado), 0)::numeric as realizado,
				count(*)::int as linhas,
				count(distinct fornecedor_id)::int as fornecedores
			from finan_orcamento_lancamentos
			where data >= $1 and data <= $2`,
			[range.inicio, range.fim],
		),
		db.query(
			`with matriz as (select coalesce(sum(orcado), 0)::numeric as orcado from finan_orcamento_matriz where ano = $1 and mes = $2),
			lancamentos as (select coalesce(sum(realizado), 0)::numeric as realizado from finan_orcamento_lancamentos where ano = $1 and mes = $2)
			select matriz.orcado, lancamentos.realizado from matriz cross join lancamentos`,
			[ano, mes],
		),
		db.query(`select titulo, valor_alvo, valor_atual, status from finan_metas where status = 'ativa' order by created_at desc limit 3`).catch(() => ({ rows: [] })),
	]);

	const realizadoPeriodo = Number(totaisPeriodo.rows[0]?.realizado || 0);
	const orcadoMes = Number(orcamentoMes.rows[0]?.orcado || 0);
	const realizadoMes = Number(orcamentoMes.rows[0]?.realizado || 0);
	const percentualMes = orcadoMes ? (realizadoMes / orcadoMes) * 100 : 0;

	// Roteiro #1 ja calcula riscos/insights pro mes atual — reaproveitado
	// aqui como a secao "riscos e recomendacoes" do briefing.
	const insightsList = await buildInsights();
	const riscos = insightsList.filter((item) => item.severidade === "critico" || item.severidade === "atencao");
	const recomendacoes = riscos.map((item) => {
		if (item.id === "sem-categoria") return "Classificar os lançamentos sem categoria antes do fechamento do mês.";
		if (item.id === "ritmo-orcamento") return "Revisar os maiores centros de custo consumindo o orçamento acima do ritmo esperado.";
		if (item.id === "integracoes-erro") return "Verificar as integrações com erro em Configuração Geral > Integrações.";
		if (item.id.startsWith("contrato-")) return `Confirmar a renovação/reajuste do contrato mencionado antes do vencimento.`;
		return "Revisar o item sinalizado acima.";
	});

	const resumoTexto = [
		`Briefing Executivo — ${range.label}.`,
		`Realizado no período: ${formatBRL(realizadoPeriodo)} em ${totaisPeriodo.rows[0]?.linhas || 0} lançamento(s), ${totaisPeriodo.rows[0]?.fornecedores || 0} fornecedor(es).`,
		`Orçamento do mês: ${formatBRL(realizadoMes)} de ${formatBRL(orcadoMes)} (${percentualMes.toFixed(0)}%).`,
		riscos.length ? `${riscos.length} risco(s)/atenção(ões): ${riscos.map((r) => r.texto).join(" ")}` : "Nenhum risco crítico identificado no momento.",
	].join(" ");

	return {
		periodo,
		range: { inicio: range.inicio, fim: range.fim, label: range.label },
		receita: null, // Finan ainda nao tem receita/faturamento estruturado fora dos reports Serasa/Tarifas — nao inventa numero aqui.
		despesas: { realizadoPeriodo, linhas: totaisPeriodo.rows[0]?.linhas || 0, fornecedores: totaisPeriodo.rows[0]?.fornecedores || 0 },
		orcamentoMes: { orcado: orcadoMes, realizado: realizadoMes, percentual: percentualMes },
		metas: metas.rows,
		riscos,
		recomendacoes,
		resumoTexto,
	};
}

router.get("/", async (req, res, next) => {
	try {
		const periodo = ["diario", "semanal", "mensal"].includes(req.query?.periodo) ? req.query.periodo : "mensal";
		res.json({ ok: true, briefing: await buildBriefing(periodo) });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
