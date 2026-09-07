export const DRE_LINE_IDS = {
	RECEITA_BRUTA: "receita_bruta",
	DEDUCOES_ABATIMENTOS: "deducoes_abatimentos",
	RECEITA_LIQUIDA: "receita_liquida",
	CPV_CMV: "cpv_cmv",
	LUCRO_BRUTO: "lucro_bruto",
	DESPESAS_VENDAS: "despesas_vendas",
	DESPESAS_ADMINISTRATIVAS: "despesas_administrativas",
	DESPESAS_FINANCEIRAS: "despesas_financeiras",
	RESULTADO_ANTES_IRPJ_CSLL: "resultado_antes_irpj_csll",
	PROVISOES_IRPJ_CSLL: "provisoes_irpj_csll",
	RESULTADO_LIQUIDO: "resultado_liquido",
};

export const DRE_STATEMENT_LINES = [
	{ id: DRE_LINE_IDS.RECEITA_BRUTA, order: 1, label: "Receita Bruta", type: "input" },
	{
		id: DRE_LINE_IDS.DEDUCOES_ABATIMENTOS,
		order: 2,
		label: "(-) Deduções e Abatimentos",
		type: "input",
	},
	{
		id: DRE_LINE_IDS.RECEITA_LIQUIDA,
		order: 3,
		label: "(=) Receita Líquida",
		type: "result",
	},
	{ id: DRE_LINE_IDS.CPV_CMV, order: 4, label: "(-) CPV/CMV", type: "input" },
	{
		id: DRE_LINE_IDS.LUCRO_BRUTO,
		order: 5,
		label: "(=) Lucro Bruto",
		type: "result",
	},
	{
		id: DRE_LINE_IDS.DESPESAS_VENDAS,
		order: 6,
		label: "(-) Despesas com Vendas",
		type: "input",
	},
	{
		id: DRE_LINE_IDS.DESPESAS_ADMINISTRATIVAS,
		order: 7,
		label: "(-) Despesas Administrativas",
		type: "input",
	},
	{
		id: DRE_LINE_IDS.DESPESAS_FINANCEIRAS,
		order: 8,
		label: "(-) Despesas Financeiras",
		type: "input",
	},
	{
		id: DRE_LINE_IDS.RESULTADO_ANTES_IRPJ_CSLL,
		order: 9,
		label: "(=) Resultado Antes de IRPJ/CSLL",
		type: "result",
	},
	{
		id: DRE_LINE_IDS.PROVISOES_IRPJ_CSLL,
		order: 10,
		label: "(-) Provisões IRPJ e CSLL",
		type: "input",
	},
	{
		id: DRE_LINE_IDS.RESULTADO_LIQUIDO,
		order: 11,
		label: "(=) Resultado Líquido do Exercício",
		type: "result",
	},
];

export const DRE_INPUT_LINE_IDS = DRE_STATEMENT_LINES.filter(
	(line) => line.type === "input",
).map((line) => line.id);

function normalizeText(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const DRE_CATEGORY_MATCHERS = [
	{
		id: DRE_LINE_IDS.RECEITA_BRUTA,
		keywords: ["receita bruta", "faturamento bruto", "vendas brutas"],
	},
	{
		id: DRE_LINE_IDS.DEDUCOES_ABATIMENTOS,
		keywords: [
			"deducoes",
			"deducao",
			"abatimentos",
			"abatimento",
			"impostos sobre vendas",
			"devolucoes",
			"cancelamentos",
		],
	},
	{
		id: DRE_LINE_IDS.CPV_CMV,
		keywords: [
			"cpv",
			"cmv",
			"custo dos produtos vendidos",
			"custo das mercadorias vendidas",
			"custo produto vendido",
			"custo mercadoria vendida",
		],
	},
	{
		id: DRE_LINE_IDS.DESPESAS_VENDAS,
		keywords: ["despesas com vendas", "despesa comercial", "comercial"],
	},
	{
		id: DRE_LINE_IDS.DESPESAS_ADMINISTRATIVAS,
		keywords: [
			"despesas administrativas",
			"despesa administrativa",
			"administrativo",
		],
	},
	{
		id: DRE_LINE_IDS.DESPESAS_FINANCEIRAS,
		keywords: ["despesas financeiras", "despesa financeira", "financeiras"],
	},
	{
		id: DRE_LINE_IDS.PROVISOES_IRPJ_CSLL,
		keywords: ["provisoes irpj csll", "irpj", "csll"],
	},
];

export function classifyDreCategory(value) {
	const normalized = normalizeText(value);
	if (!normalized) return "";
	const exact = DRE_CATEGORY_MATCHERS.find((matcher) =>
		matcher.keywords.includes(normalized),
	);
	if (exact) return exact.id;
	const partial = DRE_CATEGORY_MATCHERS.find((matcher) =>
		matcher.keywords.some((keyword) => normalized.includes(keyword)),
	);
	return partial?.id || "";
}

function cents(value) {
	return Math.round(Number(value || 0) * 100);
}

function fromCents(value) {
	return Math.round(Number(value || 0)) / 100;
}

export function calculateDreStatement(totalsByLine = {}) {
	const base = Object.fromEntries(
		DRE_STATEMENT_LINES.map((line) => [line.id, cents(totalsByLine[line.id])]),
	);
	base[DRE_LINE_IDS.RECEITA_LIQUIDA] =
		base[DRE_LINE_IDS.RECEITA_BRUTA] - base[DRE_LINE_IDS.DEDUCOES_ABATIMENTOS];
	base[DRE_LINE_IDS.LUCRO_BRUTO] =
		base[DRE_LINE_IDS.RECEITA_LIQUIDA] - base[DRE_LINE_IDS.CPV_CMV];
	base[DRE_LINE_IDS.RESULTADO_ANTES_IRPJ_CSLL] =
		base[DRE_LINE_IDS.LUCRO_BRUTO] -
		(base[DRE_LINE_IDS.DESPESAS_VENDAS] +
			base[DRE_LINE_IDS.DESPESAS_ADMINISTRATIVAS] +
			base[DRE_LINE_IDS.DESPESAS_FINANCEIRAS]);
	base[DRE_LINE_IDS.RESULTADO_LIQUIDO] =
		base[DRE_LINE_IDS.RESULTADO_ANTES_IRPJ_CSLL] -
		base[DRE_LINE_IDS.PROVISOES_IRPJ_CSLL];

	return DRE_STATEMENT_LINES.map((line) => ({
		...line,
		value: fromCents(base[line.id]),
	}));
}
