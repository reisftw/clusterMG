// Roteiro Finan #36 (Fase 4C — Snapshots financeiros de fechamento):
// resumo orçamentário (orçado/realizado/linhas) extraído de routes.js
// pra ser reaproveitado tanto na leitura ao vivo (GET /resumo) quanto na
// captura da fotografia congelada no momento do fechamento do mês
// (fechamento/routes.js:/fechar) — a mesma query, sem duplicar.
const db = require("../db");

// Roteiro Finan #37 (Versionamento de orçamento): `versaoId` filtra a
// MATRIZ (orçado) — o realizado nunca é versionado (é o mesmo dado real
// independente de qual revisão de orçamento está sendo comparada com
// ele). Bug latente corrigido aqui: antes do #37 essa query não filtrava
// versao_id nenhum — inofensivo enquanto só existia a versão "budget",
// mas somaria o orçado de TODAS as versões (dupla contagem) assim que
// uma segunda versão existisse.
async function getResumoOrcamento(ano, mes, versaoId = "budget") {
	const { rows } = await db.query(
		`with matriz as (
			select coalesce(sum(orcado), 0)::numeric as orcado
			from finan_orcamento_matriz
			where ano = $1 and mes = $2 and versao_id = $3
		),
		lancamentos as (
			select
				coalesce(sum(realizado), 0)::numeric as realizado,
				count(*)::integer as linhas
			from finan_orcamento_lancamentos
			where ano = $1 and mes = $2
		)
		select matriz.orcado, lancamentos.realizado, lancamentos.linhas
		from matriz cross join lancamentos`,
		[ano, mes, versaoId],
	);
	return rows[0] || { orcado: 0, realizado: 0, linhas: 0 };
}

module.exports = { getResumoOrcamento };
