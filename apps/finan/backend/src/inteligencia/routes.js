// Fase 2 do Roteiro Finan — Inteligência: Comparador de períodos (#3),
// Detecção de anomalias (#2), Forecast financeiro (#4), Finan Score (#5)
// e Simulador financeiro (#20). Nenhuma tabela nova — tudo computado em
// cima de finan_orcamento_lancamentos/matriz, finan_fornecedores e dos
// módulos da Fase 1 (pendências, contratos). Sem histórico de anos
// ainda (só o backfill vai trazer isso), então cada endpoint retorna
// explicitamente `confianca`/`amostras` quando o resultado é baseado em
// pouco dado, em vez de fingir uma certeza que não existe.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));
router.use(noStore);

function currentPeriod() {
	const now = new Date();
	return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
}

function previousPeriod(ano, mes) {
	return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

async function periodTotals(ano, mes) {
	const { rows } = await db.query(
		`with matriz as (
			select coalesce(sum(orcado), 0)::numeric as orcado from finan_orcamento_matriz where ano = $1 and mes = $2
		), lancamentos as (
			select coalesce(sum(realizado), 0)::numeric as realizado, count(*)::int as linhas
			from finan_orcamento_lancamentos where ano = $1 and mes = $2
		)
		select matriz.orcado, lancamentos.realizado, lancamentos.linhas from matriz cross join lancamentos`,
		[ano, mes],
	);
	return {
		orcado: Number(rows[0]?.orcado || 0),
		realizado: Number(rows[0]?.realizado || 0),
		linhas: Number(rows[0]?.linhas || 0),
	};
}

async function periodByDimension(ano, mes, dimension) {
	const joinTable = dimension === "conta" ? "finan_contas" : dimension === "fornecedor" ? "finan_fornecedores" : "finan_centros_custo";
	const idColumn = dimension === "conta" ? "conta_id" : dimension === "fornecedor" ? "fornecedor_id" : "centro_custo_id";
	const { rows } = await db.query(
		`select ol.${idColumn} as id, coalesce(d.nome, 'Não informado') as nome, coalesce(sum(ol.realizado), 0)::numeric as total
		from finan_orcamento_lancamentos ol
		left join ${joinTable} d on d.id = ol.${idColumn}
		where ol.ano = $1 and ol.mes = $2
		group by ol.${idColumn}, d.nome`,
		[ano, mes],
	);
	return rows;
}

function variancia(atual, anterior) {
	const abs = atual - anterior;
	const pct = anterior !== 0 ? (abs / Math.abs(anterior)) * 100 : atual !== 0 ? 100 : 0;
	return { absoluta: abs, percentual: pct };
}

function formatBRL(value) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

// Roteiro Finan #44: pega as 2-3 maiores causas de cada dimensão
// (fornecedor e conta) com variação relevante (>= R$ 1 mil de módulo,
// pra não citar ruído de centavos) e monta uma frase determinística —
// mesmo espírito do #1 (texto fixo por regra, sem custo de IA por
// chamada, como o próprio roteiro recomenda pro #45 mais adiante).
function buildExplicacaoVariacao(variacoesFornecedores, variacoesContas) {
	const relevantes = (lista) => lista.filter((item) => Math.abs(item.absoluta) >= 1000).slice(0, 3);
	const causasFornecedor = relevantes(variacoesFornecedores);
	const causasConta = relevantes(variacoesContas);

	if (!causasFornecedor.length && !causasConta.length) {
		return "Sem variação relevante (acima de R$ 1 mil) entre os dois períodos comparados.";
	}

	const trechoFornecedor = causasFornecedor
		.map((item) => `${item.absoluta >= 0 ? "+" : ""}${formatBRL(item.absoluta)} de ${item.nome}`)
		.join(", ");
	const trechoConta = causasConta
		.map((item) => `${item.absoluta >= 0 ? "+" : ""}${formatBRL(item.absoluta)} de ${item.nome}`)
		.join(", ");

	const partes = [];
	if (trechoFornecedor) partes.push(`por fornecedor: ${trechoFornecedor}`);
	if (trechoConta) partes.push(`por conta: ${trechoConta}`);
	return `Maiores causas prováveis da variação — ${partes.join(" · ")}.`;
}

// #3 Comparador de períodos: dois meses lado a lado (orçamento, contas,
// centros, fornecedores), com destaque automático do que mais mudou.
// Escopo desta v1: dimensões do orçamento (não há ainda contas a
// receber/faturamento/notas no Finan — ver roteiro Fase 3).
router.get("/comparador", async (req, res, next) => {
	try {
		const now = currentPeriod();
		const anoA = Number(req.query?.anoA || now.ano);
		const mesA = Number(req.query?.mesA || now.mes);
		const prev = previousPeriod(anoA, mesA);
		const anoB = Number(req.query?.anoB || prev.ano);
		const mesB = Number(req.query?.mesB || prev.mes);

		const [totalsA, totalsB, fornecedoresA, fornecedoresB, contasA, contasB] = await Promise.all([
			periodTotals(anoA, mesA),
			periodTotals(anoB, mesB),
			periodByDimension(anoA, mesA, "fornecedor"),
			periodByDimension(anoB, mesB, "fornecedor"),
			periodByDimension(anoA, mesA, "conta"),
			periodByDimension(anoB, mesB, "conta"),
		]);

		function maioresVariacoes(rowsA, rowsB) {
			const mapaB = new Map(rowsB.map((row) => [row.id, row]));
			return rowsA
				.map((row) => {
					const anterior = mapaB.get(row.id);
					const totalAnterior = Number(anterior?.total || 0);
					return { id: row.id, nome: row.nome, totalAtual: Number(row.total), totalAnterior, ...variancia(Number(row.total), totalAnterior) };
				})
				.sort((a, b) => Math.abs(b.absoluta) - Math.abs(a.absoluta))
				.slice(0, 10);
		}

		const variacoesFornecedores = maioresVariacoes(fornecedoresA, fornecedoresB);
		const variacoesContas = maioresVariacoes(contasA, contasB);

		res.json({
			ok: true,
			periodoA: { ano: anoA, mes: mesA, ...totalsA },
			periodoB: { ano: anoB, mes: mesB, ...totalsB },
			variacaoOrcamento: variancia(totalsA.realizado, totalsB.realizado),
			maioresVariacoesFornecedores: variacoesFornecedores,
			maioresVariacoesContas: variacoesContas,
			// Roteiro Finan #44 (Fase 4E — Explicação automática de variação,
			// usa #43): atribuição determinística do desvio às causas mais
			// prováveis — sem IA generativa, só os maiores contribuintes
			// (fornecedor/conta) já calculados acima, formatados em texto.
			explicacaoAutomatica: buildExplicacaoVariacao(variacoesFornecedores, variacoesContas),
			temDadosSuficientes: totalsB.linhas > 0,
		});
	} catch (error) {
		next(error);
	}
});

// #2 Detecção de anomalias: compara o mes escolhido contra a
// media/desvio-padrao dos meses ANTERIORES do mesmo fornecedor+conta —
// deliberadamente exclui o proprio mes do calculo da media, e so aponta
// anomalia quando ha pelo menos 3 meses de historico anterior (senao
// fica silencioso, nao inventa alarme com 1 mes de dado).
router.get("/anomalias", async (req, res, next) => {
	try {
		const now = currentPeriod();
		const ano = Number(req.query?.ano || now.ano);
		const mes = Number(req.query?.mes || now.mes);

		const { rows } = await db.query(
			`with atual as (
				select fornecedor_id, conta_id, coalesce(sum(realizado), 0)::numeric as total
				from finan_orcamento_lancamentos
				where ano = $1 and mes = $2 and fornecedor_id is not null
				group by fornecedor_id, conta_id
			), historico as (
				select fornecedor_id, conta_id, ano, mes, coalesce(sum(realizado), 0)::numeric as total
				from finan_orcamento_lancamentos
				where fornecedor_id is not null and (ano < $1 or (ano = $1 and mes < $2))
				group by fornecedor_id, conta_id, ano, mes
			), estatisticas as (
				select fornecedor_id, conta_id,
					count(*)::int as amostras,
					avg(total)::numeric as media,
					coalesce(stddev_pop(total), 0)::numeric as desvio
				from historico
				group by fornecedor_id, conta_id
				having count(*) >= 3
			)
			select
				atual.fornecedor_id, f.nome as fornecedor_nome,
				atual.conta_id, c.nome as conta_nome,
				atual.total as valor_atual,
				estatisticas.media, estatisticas.desvio, estatisticas.amostras
			from atual
			join estatisticas on estatisticas.fornecedor_id = atual.fornecedor_id and estatisticas.conta_id is not distinct from atual.conta_id
			left join finan_fornecedores f on f.id = atual.fornecedor_id
			left join finan_contas c on c.id = atual.conta_id
			where estatisticas.media > 0
				and abs(atual.total - estatisticas.media) > greatest(estatisticas.desvio * 2, estatisticas.media * 0.5)
			order by abs(atual.total - estatisticas.media) desc
			limit 30`,
			[ano, mes],
		);

		const anomalias = rows.map((row) => {
			const media = Number(row.media || 0);
			const atual = Number(row.valor_atual || 0);
			const percentual = media ? ((atual - media) / media) * 100 : 0;
			return {
				fornecedorNome: row.fornecedor_nome || "Fornecedor não informado",
				contaNome: row.conta_nome || "Conta não informada",
				valorAtual: atual,
				mediaHistorica: media,
				amostras: row.amostras,
				percentual,
				direcao: percentual >= 0 ? "acima" : "abaixo",
			};
		});

		res.json({ ok: true, periodo: { ano, mes }, anomalias });
	} catch (error) {
		next(error);
	}
});

// #4 Forecast financeiro: media movel simples dos ultimos N meses com
// dado real (sem sazonalidade — precisa de pelo menos 12 meses de
// historico pra isso fazer sentido, que só chega com o backfill).
// Cenarios conservador/provavel/otimista sao uma banda percentual em
// torno da media, nao uma projecao estatistica robusta ainda.
router.get("/forecast", async (req, res, next) => {
	try {
		const now = currentPeriod();
		const janela = Math.min(Math.max(Number(req.query?.meses || 6), 1), 24);

		const { rows } = await db.query(
			`select ano, mes, coalesce(sum(realizado), 0)::numeric as realizado
			from finan_orcamento_lancamentos
			where (ano < $1) or (ano = $1 and mes <= $2)
			group by ano, mes
			order by ano desc, mes desc
			limit $3`,
			[now.ano, now.mes, janela],
		);

		if (!rows.length) {
			res.json({ ok: true, amostras: 0, confianca: "sem_dados", provavel: 0, conservador: 0, otimista: 0, historico: [] });
			return;
		}

		const valores = rows.map((row) => Number(row.realizado));
		const media = valores.reduce((sum, value) => sum + value, 0) / valores.length;
		const confianca = valores.length >= 6 ? "media" : valores.length >= 3 ? "baixa" : "muito_baixa";

		res.json({
			ok: true,
			amostras: valores.length,
			confianca,
			provavel: media,
			conservador: media * 1.1, // cenario conservador = mais despesa, saldo pior
			otimista: media * 0.9,
			historico: rows.reverse().map((row) => ({ ano: row.ano, mes: row.mes, realizado: Number(row.realizado) })),
		});
	} catch (error) {
		next(error);
	}
});

// #5 Finan Score: nota 0-100 combinando 4 fatores reais hoje disponiveis
// no Finan (ritmo do orcamento, concentracao de fornecedor, pendencias
// de categorizacao e duplicidades). Fatores como inadimplencia/contas
// vencidas ficam de fora ate o modulo de contas a pagar/receber existir
// (roteiro Fase 3) — a nota reflete isso na propria lista de fatores,
// nao finge medir o que ainda nao existe.
router.get("/score", async (_req, res, next) => {
	try {
		const now = currentPeriod();
		const totals = await periodTotals(now.ano, now.mes);

		const nowDate = new Date();
		const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
		const idealPercent = (nowDate.getDate() / daysInMonth) * 100;
		const usedPercent = totals.orcado ? (totals.realizado / totals.orcado) * 100 : 0;
		const ritmoGap = Math.max(0, usedPercent - idealPercent);
		const fatorRitmo = Math.max(0, 100 - ritmoGap * 2);

		const [semCategoria, fornecedoresAno, duplicidades] = await Promise.all([
			db.query(
				`select count(*)::int as total from finan_orcamento_lancamentos
				where ano = $1 and mes = $2 and (conta_id is null or centro_custo_id is null)`,
				[now.ano, now.mes],
			),
			db.query(
				`select coalesce(sum(realizado), 0)::numeric as total from finan_orcamento_lancamentos where ano = $1 and fornecedor_id is not null`,
				[now.ano],
			),
			db.query(
				`select count(*)::int as total
				from finan_orcamento_lancamentos a
				join finan_orcamento_lancamentos b
					on a.fornecedor_id = b.fornecedor_id and a.realizado = b.realizado and a.id < b.id
					and a.data is not null and b.data is not null and abs(a.data - b.data) <= 5
				where a.ano = $1 and a.mes = $2 and b.ano = $1 and b.mes = $2
					and a.fornecedor_id is not null and a.realizado <> 0`,
				[now.ano, now.mes],
			),
		]);

		const top3 = await db.query(
			`select coalesce(sum(t.total), 0)::numeric as top3
			from (
				select coalesce(sum(realizado), 0)::numeric as total
				from finan_orcamento_lancamentos
				where ano = $1 and fornecedor_id is not null
				group by fornecedor_id
				order by total desc
				limit 3
			) t`,
			[now.ano],
		);
		const grandTotal = Number(fornecedoresAno.rows[0]?.total || 0);
		const concentracaoPercent = grandTotal ? (Number(top3.rows[0]?.top3 || 0) / grandTotal) * 100 : 0;
		const fatorConcentracao = Math.max(0, 100 - Math.max(0, concentracaoPercent - 40));

		const pendentesCount = Number(semCategoria.rows[0]?.total || 0);
		const fatorPendencias = pendentesCount === 0 ? 100 : Math.max(0, 100 - pendentesCount * 5);

		const duplicidadesCount = Number(duplicidades.rows[0]?.total || 0);
		const fatorDuplicidades = duplicidadesCount === 0 ? 100 : Math.max(0, 100 - duplicidadesCount * 10);

		const fatores = [
			{ id: "ritmo_orcamento", label: "Ritmo do orçamento", valor: Math.round(fatorRitmo), peso: 0.4 },
			{ id: "concentracao_fornecedor", label: "Concentração de fornecedor", valor: Math.round(fatorConcentracao), peso: 0.25 },
			{ id: "pendencias", label: "Lançamentos categorizados", valor: Math.round(fatorPendencias), peso: 0.2 },
			{ id: "duplicidades", label: "Sem duplicidades em aberto", valor: Math.round(fatorDuplicidades), peso: 0.15 },
		];
		const score = Math.round(fatores.reduce((sum, fator) => sum + fator.valor * fator.peso, 0));

		res.json({
			ok: true,
			score,
			fatores,
			forasDoEscopo: ["Inadimplência", "Contas vencidas"],
			forasDoEscopoMotivo: "Aguardam o módulo de Contas a Pagar/Receber (Fase 3 do roteiro).",
		});
	} catch (error) {
		next(error);
	}
});

// #20 Simulador financeiro: recalcula o total do mes aplicando um
// percentual hipotetico sobre um fornecedor ou uma conta especifica.
// So leitura/calculo — nunca grava nada.
router.post("/simulador", async (req, res, next) => {
	try {
		const now = currentPeriod();
		const ano = Number(req.body?.ano || now.ano);
		const mes = Number(req.body?.mes || now.mes);
		const tipo = String(req.body?.tipo || "");
		const id = String(req.body?.id || "");
		const percentual = Number(req.body?.percentual || 0);

		if (!["fornecedor", "conta"].includes(tipo) || !id || !Number.isFinite(percentual)) {
			res.status(400).json({ ok: false, error: "Informe tipo (fornecedor|conta), id e percentual." });
			return;
		}

		const column = tipo === "fornecedor" ? "fornecedor_id" : "conta_id";
		const [totals, item] = await Promise.all([
			periodTotals(ano, mes),
			db.query(
				`select coalesce(sum(realizado), 0)::numeric as total from finan_orcamento_lancamentos where ano = $1 and mes = $2 and ${column} = $3`,
				[ano, mes, id],
			),
		]);

		const valorAtualItem = Number(item.rows[0]?.total || 0);
		const valorSimuladoItem = valorAtualItem * (1 + percentual / 100);
		const novoTotal = totals.realizado - valorAtualItem + valorSimuladoItem;
		const novoUsedPercent = totals.orcado ? (novoTotal / totals.orcado) * 100 : 0;

		res.json({
			ok: true,
			atual: { total: totals.realizado, usedPercent: totals.orcado ? (totals.realizado / totals.orcado) * 100 : 0 },
			simulado: { total: novoTotal, usedPercent: novoUsedPercent, valorItemAntes: valorAtualItem, valorItemDepois: valorSimuladoItem },
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
