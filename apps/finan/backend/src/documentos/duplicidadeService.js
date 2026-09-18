// Roteiro Finan #34 (Fase 4B — Detecção avançada de duplicidade, estende
// #14): evolui de "fornecedor + valor + data" (orcamento/routes.js,
// sobre lançamentos genéricos) para CNPJ + valor + emissão + vencimento
// + número + similaridade textual, com % de confiança — sobre Notas
// Fiscais de verdade (finan_notas_fiscais), que tem esses campos.
//
// Pontuação (soma até 100, cada sinal e independente — nota sem numero
// ou sem data de vencimento so perde os pontos daquele sinal, nao zera
// os outros):
//   CNPJ do emissor igual ......... 30 (o par so existe pq o SQL ja
//                                       filtrou por cnpj_emissor igual)
//   Valor igual .................... 25 (idem — o SQL so junta valor==valor)
//   Número da nota igual (normalizado, sem zeros a esquerda/pontuação) . 25
//   Data de emissão próxima ........ até 12 (decai linear ate 10 dias)
//   Data de vencimento próxima ..... até 8  (decai linear ate 10 dias)
// Só entra no resultado quem passa de CONFIDENCE_THRESHOLD — casar só
// por CNPJ+valor (55 pontos) já e um sinal razoavel sozinho, mas o
// numero/data e o que separa "provavel duplicata" de "coincidencia".
const db = require("../db");

const CONFIDENCE_THRESHOLD = 55;
const DATE_PROXIMITY_DAYS = 10;

function normalizeNumero(value) {
	return String(value || "").replace(/\D/g, "").replace(/^0+/, "");
}

function daysBetween(a, b) {
	if (!a || !b) return null;
	const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
	if (!Number.isFinite(diffMs)) return null;
	return diffMs / (1000 * 60 * 60 * 24);
}

function proximityScore(days, maxDays, maxPoints) {
	if (days === null) return 0;
	if (days > maxDays) return 0;
	return Math.round(maxPoints * (1 - days / maxDays));
}

// Similaridade textual por bigramas (coeficiente de Dice) — barata,
// determinística, sem dependência externa. Usada só como informação
// extra no resultado (não soma na pontuação de confiança, que já é
// baseada em campos estruturados mais confiáveis que texto livre).
function bigrams(text) {
	const clean = String(text || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const set = new Set();
	for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
	return set;
}

function textSimilarity(a, b) {
	const setA = bigrams(a);
	const setB = bigrams(b);
	if (!setA.size || !setB.size) return 0;
	let intersection = 0;
	setA.forEach((gram) => {
		if (setB.has(gram)) intersection += 1;
	});
	return Number(((2 * intersection) / (setA.size + setB.size)).toFixed(2));
}

function scorePair(a, b) {
	let confidence = 30 + 25; // cnpj + valor ja garantidos pelo filtro SQL
	const numeroA = normalizeNumero(a.numero);
	const numeroB = normalizeNumero(b.numero);
	const numeroMatch = Boolean(numeroA) && numeroA === numeroB;
	if (numeroMatch) confidence += 25;

	const emissaoDays = daysBetween(a.data_emissao, b.data_emissao);
	confidence += proximityScore(emissaoDays, DATE_PROXIMITY_DAYS, 12);

	const vencimentoDays = daysBetween(a.data_vencimento, b.data_vencimento);
	confidence += proximityScore(vencimentoDays, DATE_PROXIMITY_DAYS, 8);

	return {
		confidence: Math.min(100, confidence),
		numeroMatch,
		emissaoDiffDias: emissaoDays === null ? null : Math.round(emissaoDays),
		vencimentoDiffDias: vencimentoDays === null ? null : Math.round(vencimentoDays),
		similaridadeDescricao: textSimilarity(a.descricao, b.descricao),
	};
}

async function findDuplicateNotas({ meses = 18 } = {}) {
	const safeMeses = Math.min(Math.max(Number(meses) || 18, 1), 60);
	const { rows } = await db.query(
		`select
			a.id as id_a, b.id as id_b,
			a.numero as numero_a, b.numero as numero_b,
			a.cnpj_emissor, a.valor,
			a.data_emissao as data_emissao_a, b.data_emissao as data_emissao_b,
			a.data_vencimento as data_vencimento_a, b.data_vencimento as data_vencimento_b,
			a.descricao as descricao_a, b.descricao as descricao_b,
			a.fornecedor_nome as fornecedor_nome_a, b.fornecedor_nome as fornecedor_nome_b,
			a.status as status_a, b.status as status_b
		from finan_notas_fiscais a
		join finan_notas_fiscais b
			on a.cnpj_emissor = b.cnpj_emissor
			and a.valor = b.valor
			and a.id < b.id
		where a.cnpj_emissor is not null and a.cnpj_emissor <> ''
			and a.valor <> 0
			and coalesce(a.data_emissao, now()) >= now() - ($1 || ' months')::interval
		order by a.data_emissao desc nulls last
		limit 500`,
		[safeMeses],
	);

	const results = rows
		.map((row) => {
			const score = scorePair(
				{ numero: row.numero_a, data_emissao: row.data_emissao_a, data_vencimento: row.data_vencimento_a, descricao: row.descricao_a },
				{ numero: row.numero_b, data_emissao: row.data_emissao_b, data_vencimento: row.data_vencimento_b, descricao: row.descricao_b },
			);
			return {
				idA: row.id_a,
				idB: row.id_b,
				cnpjEmissor: row.cnpj_emissor,
				valor: Number(row.valor),
				numeroA: row.numero_a,
				numeroB: row.numero_b,
				dataEmissaoA: row.data_emissao_a,
				dataEmissaoB: row.data_emissao_b,
				dataVencimentoA: row.data_vencimento_a,
				dataVencimentoB: row.data_vencimento_b,
				fornecedorNomeA: row.fornecedor_nome_a,
				fornecedorNomeB: row.fornecedor_nome_b,
				statusA: row.status_a,
				statusB: row.status_b,
				...score,
			};
		})
		.filter((item) => item.confidence >= CONFIDENCE_THRESHOLD)
		.sort((left, right) => right.confidence - left.confidence);

	return results;
}

module.exports = {
	CONFIDENCE_THRESHOLD,
	findDuplicateNotas,
	__testables: { scorePair, normalizeNumero, textSimilarity, daysBetween, proximityScore },
};
