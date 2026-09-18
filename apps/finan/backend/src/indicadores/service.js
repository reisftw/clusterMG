// Extraido de indicadores/routes.js pra ser reaproveitado tambem pela tool
// `consultarIndicadores` do Financeirinho (financeirinho/tools.js) sem
// duplicar o catalogo de metricas/operadores nem a logica de resolucao.
const db = require("../db");

const OPERADORES = { "/": (a, b) => (b ? a / b : 0), "*": (a, b) => a * b, "+": (a, b) => a + b, "-": (a, b) => a - b };

const METRICS = {
	despesas_totais_ano: {
		label: "Despesas totais do ano",
		query: `select coalesce(sum(realizado), 0)::numeric as valor from finan_orcamento_lancamentos where ano = extract(year from current_date)`,
	},
	total_fornecedores: {
		label: "Total de fornecedores com lançamento no ano",
		query: `select count(distinct fornecedor_id)::numeric as valor from finan_orcamento_lancamentos where ano = extract(year from current_date) and fornecedor_id is not null`,
	},
	total_lancamentos_ano: {
		label: "Total de lançamentos no ano",
		query: `select count(*)::numeric as valor from finan_orcamento_lancamentos where ano = extract(year from current_date)`,
	},
	total_contratos_ativos: {
		label: "Contratos ativos",
		query: `select count(*)::numeric as valor from finan_contratos where ativo is not false`,
	},
	total_usuarios_ativos: {
		label: "Usuários ativos",
		query: `select count(*)::numeric as valor from finan_users where status = 'ativo'`,
	},
};

const METRIC_KEYS = Object.keys(METRICS);

async function resolveMetric(key) {
	const metric = METRICS[key];
	if (!metric) return 0;
	const { rows } = await db.query(metric.query);
	return Number(rows[0]?.valor || 0);
}

async function listIndicadoresComValor() {
	const { rows } = await db.query(`select * from finan_indicadores order by created_at desc`);
	return Promise.all(
		rows.map(async (row) => {
			const [valorA, valorB] = await Promise.all([resolveMetric(row.metrica_a), resolveMetric(row.metrica_b)]);
			const operar = OPERADORES[row.operador] || OPERADORES["/"];
			return {
				id: row.id,
				nome: row.nome,
				metricaA: row.metrica_a,
				metricaALabel: METRICS[row.metrica_a]?.label || row.metrica_a,
				operador: row.operador,
				metricaB: row.metrica_b,
				metricaBLabel: METRICS[row.metrica_b]?.label || row.metrica_b,
				valor: operar(valorA, valorB),
			};
		}),
	);
}

module.exports = { METRICS, METRIC_KEYS, OPERADORES, resolveMetric, listIndicadoresComValor };
