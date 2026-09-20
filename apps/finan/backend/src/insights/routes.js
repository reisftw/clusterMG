// Roteiro Finan #1 (Finan Insights / Resumo Semanal) e #23 (Comandos em
// linguagem natural v1): frases fixas geradas a partir de metricas ja
// existentes (orcamento, pendencias, fornecedores, contratos, metas) —
// nada de LLM externo, respostas sempre deterministicas e sem custo por
// chamada. O #23 casa a pergunta contra um catalogo fechado de padroes;
// fora desse catalogo, responde com uma mensagem de "nao entendi".
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();

router.use(requireFinanPermission(["finan.dashboard.view", "finan.gestao_orcamentaria.view"]));
router.use(noStore);

function currentPeriod() {
	const now = new Date();
	return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function buildInsights() {
	const { ano, mes } = currentPeriod();
	const insights = [];

	const orcamento = await db.query(
		`with matriz as (
			select coalesce(sum(orcado), 0)::numeric as orcado from finan_orcamento_matriz where ano = $1 and mes = $2
		), lancamentos as (
			select coalesce(sum(realizado), 0)::numeric as realizado from finan_orcamento_lancamentos where ano = $1 and mes = $2
		)
		select matriz.orcado, lancamentos.realizado from matriz cross join lancamentos`,
		[ano, mes],
	);
	const orcado = Number(orcamento.rows[0]?.orcado || 0);
	const realizado = Number(orcamento.rows[0]?.realizado || 0);
	if (orcado > 0) {
		const usedPercent = (realizado / orcado) * 100;
		const now = new Date();
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const idealPercent = (now.getDate() / daysInMonth) * 100;
		if (usedPercent - idealPercent > 10) {
			insights.push({
				id: "ritmo-orcamento",
				texto: `O orçamento está ${usedPercent.toFixed(0)}% consumido, acima do ritmo esperado para o mês (${idealPercent.toFixed(0)}%).`,
				severidade: "atencao",
			});
		} else {
			insights.push({
				id: "ritmo-orcamento",
				texto: `Orçamento em dia: ${usedPercent.toFixed(0)}% consumido, dentro do ritmo esperado.`,
				severidade: "info",
			});
		}
	}

	const semCategoria = await db.query(
		`select count(*)::int as total from finan_orcamento_lancamentos where ano = $1 and mes = $2 and (conta_id is null or centro_custo_id is null)`,
		[ano, mes],
	);
	if (semCategoria.rows[0]?.total > 0) {
		insights.push({
			id: "sem-categoria",
			texto: `${semCategoria.rows[0].total} lançamento(s) deste mês ainda estão sem categoria ou centro de custo.`,
			severidade: "atencao",
		});
	}

	const fornecedores = await db.query(
		`select f.nome, coalesce(sum(ol.realizado), 0)::numeric as total
		from finan_orcamento_lancamentos ol
		join finan_fornecedores f on f.id = ol.fornecedor_id
		where ol.ano = $1
		group by f.nome
		order by total desc
		limit 1`,
		[ano],
	);
	if (fornecedores.rows[0]) {
		insights.push({
			id: "maior-fornecedor",
			texto: `${fornecedores.rows[0].nome} é o fornecedor com maior gasto no ano até agora (${formatMoney(fornecedores.rows[0].total)}).`,
			severidade: "info",
		});
	}

	const contratos = await db.query(
		`select nome, data_renovacao from finan_contratos
		where ativo is not false and data_renovacao is not null and data_renovacao <= current_date + interval '30 days'
		order by data_renovacao
		limit 3`,
	);
	contratos.rows.forEach((row) => {
		const dias = Math.ceil((new Date(row.data_renovacao) - new Date()) / (1000 * 60 * 60 * 24));
		insights.push({
			id: `contrato-${row.nome}`,
			texto: `Contrato ${row.nome} vence em ${dias} dia(s).`,
			severidade: "atencao",
		});
	});

	const integracoesErro = await db.query(`select count(*)::int as total from finan_integration_configs where status = 'erro'`);
	if (integracoesErro.rows[0]?.total > 0) {
		insights.push({
			id: "integracoes-erro",
			texto: `${integracoesErro.rows[0].total} integração(ões) estão com erro e precisam de atenção.`,
			severidade: "critico",
		});
	}

	return insights;
}

router.get("/", async (_req, res, next) => {
	try {
		res.json({ ok: true, insights: await buildInsights() });
	} catch (error) {
		next(error);
	}
});

// Roteiro Finan #23: casa a pergunta contra um catalogo fechado de
// padroes conhecidos. Nunca gera SQL a partir do texto do usuario.
router.get("/financeirinho", async (req, res, next) => {
	try {
		const pergunta = String(req.query?.q || "").trim().toLowerCase();
		const { ano } = currentPeriod();

		if (!pergunta) {
			res.json({ ok: true, resposta: "Pergunte sobre orçamento, pendências ou um fornecedor específico." });
			return;
		}

		if (/pend[eê]ncia/.test(pergunta)) {
			const { rows } = await db.query(
				`select count(*)::int as total from finan_orcamento_lancamentos
				where ano = extract(year from current_date) and mes = extract(month from current_date)
					and (conta_id is null or centro_custo_id is null)`,
			);
			res.json({ ok: true, resposta: `${rows[0]?.total || 0} lançamento(s) sem categoria este mês. Veja a Central de Pendências para mais detalhes.` });
			return;
		}

		if (/maior fornecedor|fornecedor.*mais gast/.test(pergunta)) {
			const { rows } = await db.query(
				`select f.nome, coalesce(sum(ol.realizado), 0)::numeric as total
				from finan_orcamento_lancamentos ol join finan_fornecedores f on f.id = ol.fornecedor_id
				where ol.ano = $1 group by f.nome order by total desc limit 1`,
				[ano],
			);
			if (!rows[0]) {
				res.json({ ok: true, resposta: "Ainda não há lançamentos suficientes este ano para calcular isso." });
				return;
			}
			res.json({ ok: true, resposta: `${rows[0].nome} é o fornecedor com maior gasto em ${ano}: ${formatMoney(rows[0].total)}.` });
			return;
		}

		const fornecedorMatch = pergunta.match(/gast(?:amos|ou|ei)\s+com\s+([a-zà-ú0-9 .]+)/i);
		if (fornecedorMatch) {
			const termo = fornecedorMatch[1].trim();
			const { rows } = await db.query(
				`select f.nome, coalesce(sum(ol.realizado), 0)::numeric as total
				from finan_orcamento_lancamentos ol join finan_fornecedores f on f.id = ol.fornecedor_id
				where ol.ano = $1 and f.nome ilike $2
				group by f.nome order by total desc limit 1`,
				[ano, `%${termo}%`],
			);
			if (!rows[0]) {
				res.json({ ok: true, resposta: `Não encontrei nenhum fornecedor parecido com "${termo}" em ${ano}.` });
				return;
			}
			res.json({ ok: true, resposta: `Gastamos ${formatMoney(rows[0].total)} com ${rows[0].nome} em ${ano}.` });
			return;
		}

		if (/or[çc]amento/.test(pergunta)) {
			const { mes } = currentPeriod();
			const { rows } = await db.query(
				`with matriz as (select coalesce(sum(orcado), 0)::numeric as orcado from finan_orcamento_matriz where ano = $1 and mes = $2),
				lancamentos as (select coalesce(sum(realizado), 0)::numeric as realizado from finan_orcamento_lancamentos where ano = $1 and mes = $2)
				select matriz.orcado, lancamentos.realizado from matriz cross join lancamentos`,
				[ano, mes],
			);
			const orcado = Number(rows[0]?.orcado || 0);
			const realizado = Number(rows[0]?.realizado || 0);
			const percent = orcado ? (realizado / orcado) * 100 : 0;
			res.json({ ok: true, resposta: `Este mês: ${formatMoney(realizado)} realizados de ${formatMoney(orcado)} orçados (${percent.toFixed(0)}%).` });
			return;
		}

		res.json({
			ok: true,
			resposta: "Não entendi a pergunta. Tente algo como \"quanto gastamos com <fornecedor>\", \"qual o maior fornecedor\" ou \"como está o orçamento\".",
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
// Roteiro Finan #45 (Briefing Executivo, reune #44/#43/#18/#1):
// reaproveitado por briefing/routes.js — as mesmas frases
// deterministicas do #1 viram a secao de riscos do briefing, sem
// duplicar a logica.
module.exports.buildInsights = buildInsights;
