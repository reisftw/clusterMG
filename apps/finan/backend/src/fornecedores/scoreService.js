// Roteiro Finan #43 (Fase 4E — Centro de Inteligência de Fornecedores /
// Supplier Score, estende #8 e #9): nota combinando custo (regularidade
// do gasto mês a mês), regularidade documental (contas a pagar com nota
// fiscal vinculada) e histórico (contratos ativos, reajustes) — 3
// fatores com peso, cada um 0-100, nota final é a média ponderada.
const db = require("../db");

function coeficienteVariacao(valores) {
	const nums = valores.filter((v) => Number.isFinite(v) && v > 0);
	if (nums.length < 2) return 0;
	const media = nums.reduce((sum, v) => sum + v, 0) / nums.length;
	if (!media) return 0;
	const variancia = nums.reduce((sum, v) => sum + (v - media) ** 2, 0) / nums.length;
	const desvio = Math.sqrt(variancia);
	return desvio / media; // 0 = sempre o mesmo valor, quanto maior mais irregular
}

async function getSupplierScore(fornecedorId, { ano } = {}) {
	const year = Number(ano) || new Date().getFullYear();
	const [mensalRows, documentacaoRows, contratosRows] = await Promise.all([
		db.query(
			`select mes, coalesce(sum(realizado), 0)::numeric as total
			from finan_orcamento_lancamentos
			where fornecedor_id = $1 and ano = $2
			group by mes`,
			[fornecedorId, year],
		),
		db.query(
			`select
				count(*)::int as total,
				count(*) filter (where nota_id is not null)::int as com_nota
			from finan_contas_pagar
			where fornecedor_id = $1 and status <> 'cancelado'`,
			[fornecedorId],
		),
		db.query(
			`select count(*)::int as total, count(*) filter (where ativo)::int as ativos
			from finan_contratos
			where fornecedor_id = $1`,
			[fornecedorId],
		),
	]);

	// Regularidade de custo: quanto mais estavel o gasto mes a mes, melhor
	// (CV baixo). CV>=1 (desvio maior que a propria media) vira nota 0.
	const cv = coeficienteVariacao(mensalRows.rows.map((row) => Number(row.total)));
	const notaRegularidade = Math.round(Math.max(0, 100 - cv * 100));

	// Documentacao: % das contas a pagar desse fornecedor com NF
	// vinculada. Sem nenhuma conta a pagar ainda, nao penaliza (nota
	// neutra) — nao ha base pra avaliar.
	const docTotal = documentacaoRows.rows[0]?.total || 0;
	const docComNota = documentacaoRows.rows[0]?.com_nota || 0;
	const notaDocumentacao = docTotal ? Math.round((docComNota / docTotal) * 100) : 100;

	// Historico/relacionamento: fornecedor com contrato ativo formalizado
	// pontua melhor que um sem nenhum vinculo formal — sinal de
	// relacionamento estruturado, nao ad-hoc.
	const contratosAtivos = contratosRows.rows[0]?.ativos || 0;
	const notaHistorico = contratosAtivos > 0 ? 100 : docTotal > 0 ? 60 : 40;

	const pesos = { regularidade: 0.35, documentacao: 0.4, historico: 0.25 };
	const notaFinal = Math.round(
		notaRegularidade * pesos.regularidade + notaDocumentacao * pesos.documentacao + notaHistorico * pesos.historico,
	);

	return {
		notaFinal,
		fatores: {
			regularidadeCusto: { nota: notaRegularidade, peso: pesos.regularidade, coeficienteVariacao: Number(cv.toFixed(2)) },
			documentacao: { nota: notaDocumentacao, peso: pesos.documentacao, comNota: docComNota, total: docTotal },
			historico: { nota: notaHistorico, peso: pesos.historico, contratosAtivos },
		},
	};
}

module.exports = { getSupplierScore, coeficienteVariacao };
