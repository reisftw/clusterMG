export const BUDGET_CATEGORY_CLASSES = {
	BASAL: "basal",
	NAO_BASAL: "nao_basal",
};

export const BUDGET_CATEGORY_CLASS_LABELS = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: "BASAL",
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: "NÃO BASAL",
};

export const FINANCIAL_ACCOUNT_CATEGORY_CATALOG = [
	{
		name: "Produto",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Serviços Digitais"],
	},
	{
		name: "Transmissão",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Aluguel Postes", "Aluguel Torres"],
	},
	{
		name: "Conservação e reparo predial",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Manutenção de Imóveis"],
	},
	{
		name: "Ocupação",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Aluguel",
			"Água e Esgoto",
			"Segurança e Monitoramento",
			"IPTU",
			"Condomínio",
			"Móveis e Utensílios",
			"Energia Elétrica (Lojas, Escritorios)",
		],
	},
	{
		name: "Taxas e contribuições",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Contribuição a Entidades de Classe",
			"Taxas Estaduais",
			"Taxas de Expediente",
			"Taxas Municipais",
			"Taxas Federais",
		],
	},
	{
		name: "Marketing",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Feiras, Congressos e Exposições",
			"Ações de venda",
			"Marketing Institucional",
			"Marketing de relacionamento",
			"Propaganda",
		],
	},
	{
		name: "Impostos Retenção",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"IRRF s/ PJ",
			"FUST/FUNTEL",
			"CSLL/PIS/COFINS (retenção)",
			"IRRF s/ Aluguel",
			"INSS s/ terceiros",
		],
	},
	{
		name: "Veículos",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Multas e Infrações",
			"Lavagem",
			"Manutenção Preventiva de Veículos",
			"Manutenção Corretiva de Veículos",
		],
	},
	{
		name: "Financeiro",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Tarifas e pacotes bancários", "Tarifas Boletos"],
	},
	{
		name: "Viagens e Estadias",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Despesas de Viagens e Estadias"],
	},
	{
		name: "Administrativo",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Serviços de Conservação e Limpeza",
			"Seguros",
			"Despesas c/ cartório, autenticação e xerox",
			"Fretes e Carretos",
			"Material de Consumo",
			"Correios",
			"Locações Diversas",
			"Copa e Cozinha",
			"Lanches e Refeições",
			"Material Escrit Impressos e Mat de Exped",
			"Bens de Valores Reduzidos",
		],
	},
	{
		name: "Terceiros",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Serviços Gráficos",
			"Serviços Contábeis",
			"Serviços Jurídicos",
			"Serviços Prestados - PJ",
			"Serviços de Consultoria",
		],
	},
	{
		name: "Comercial",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Comissões PJ",
			"TI",
			"Infraestrutura de Datacenter",
			"Telefone",
			"Telefonia - STFC",
			"Computadores e Periféricos",
			"Softwares",
		],
	},
	{
		name: "Interconexão",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["Link Last Mile", "Aluguel de Rack / Cross Conexões", "Link"],
	},
	{
		name: "Logística",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Estacionamento e Pedágios",
			"Aluguel de Veículos",
			"Combustíveis - Veículos",
		],
	},
	{
		name: "Rede",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Manutenção de Máquinas e Equipamentos",
			"Ferramentas",
			"Equipamentos POP (Switches, OTDR, Baterias)",
			"Energia Elétrica (Torres, POPs, Cessão de Energia)",
			"Rede de Backbone e Rede Ramal",
		],
	},
	{
		name: "Instalação/Manutenção",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"Serviços de Manutenção (técnicos)",
			"Roteador / ONU / Modem",
			"Materiais de Instalação (metais, conectores, etc)",
			"Cabo Drop",
			"Serviços de Instalação (técnicos)",
		],
	},
	{
		name: "Pessoal",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: [
			"INSS s/ colaborador",
			"Demissões",
			"Medicamentos e Assistência Médica",
			"Vale transporte",
			"Programas de Bem-estar",
			"Seguros de Vida",
			"Décimo Terceiro Salário",
			"Pró-Labore",
			"Salários e Ordenados - PJ",
			"Acordos Trabalhistas e Indenizações",
			"Convênio Farmácia",
			"Serviços de Saúde Ocupacional",
			"Materiais de Proteção e Uniformes",
			"Ajuda de Custo",
			"Eventos Comemorativos e Homenagens",
			"Capacitação e Desenvolvimento",
			"FGTS",
			"IRRF s/ salários",
			"Férias",
			"Salários e Ordenados",
			"Programa de Alimentação do Trabalhador",
		],
	},
	{
		name: "Impostos Sobre Resultado",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["CSLL", "IRPJ"],
	},
	{
		name: "Impostos Deduções",
		classType: BUDGET_CATEGORY_CLASSES.BASAL,
		accounts: ["ICMS dif aliq.", "ISS", "PIS", "COFINS", "ICMS"],
	},
	{
		name: "Aquisições",
		classType: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		accounts: ["Veículos"],
	},
	{
		name: "Dividendos",
		classType: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		accounts: ["Lucros a Pagar (Salários e Dividendos)"],
	},
	{
		name: "Financeiro",
		classType: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		accounts: [
			"Consórcio",
			"Empréstimos bancários",
			"Empréstimos c/ partes relacionadas",
		],
	},
	{
		name: "Impostos Parcelamento",
		classType: BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		accounts: [
			"COFINS parcelamento",
			"CSLL parcelamento",
			"ICMS parcelamento",
			"IRPJ parcelamento",
			"PIS parcelamento",
		],
	},
];

const ACCOUNT_ALIASES = new Map([
	["energia", "Energia Elétrica (Lojas, Escritorios)"],
	["agua luz e telefone", "Água e Esgoto"],
]);

export function normalizeFinancialAccountCategoryKey(value = "") {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const CATEGORY_BY_ACCOUNT_KEY = FINANCIAL_ACCOUNT_CATEGORY_CATALOG.flatMap(
	(category) =>
		category.accounts.map((accountName) => [
			normalizeFinancialAccountCategoryKey(accountName),
			{ ...category, accountName },
		]),
).reduce((map, [key, category]) => map.set(key, category), new Map());

function findCategoryByAccountName(name = "") {
	const normalized = normalizeFinancialAccountCategoryKey(name);
	if (!normalized) return null;
	const alias = ACCOUNT_ALIASES.get(normalized);
	if (alias) return CATEGORY_BY_ACCOUNT_KEY.get(normalizeFinancialAccountCategoryKey(alias));
	const exact = CATEGORY_BY_ACCOUNT_KEY.get(normalized);
	if (exact) return exact;
	for (const [key, category] of CATEGORY_BY_ACCOUNT_KEY.entries()) {
		if (normalized.includes(key) || key.includes(normalized)) return category;
	}
	return null;
}

function normalizeClassType(value = "") {
	const key = normalizeFinancialAccountCategoryKey(value);
	if (["nao basal", "naobasal", "non basal", "nao_basal"].includes(key)) {
		return BUDGET_CATEGORY_CLASSES.NAO_BASAL;
	}
	if (["basal", "custo basal"].includes(key)) return BUDGET_CATEGORY_CLASSES.BASAL;
	return "";
}

export function resolveFinancialAccountCategory(account = {}) {
	const matched = findCategoryByAccountName(account.nome || account.name);
	const savedClass = normalizeClassType(
		account.categoriaClasse || account.categoryClass || account.tipoCategoria,
	);
	const savedCategory = String(
		account.categoriaMae || account.categoryName || account.categoria || "",
	).trim();
	const classType =
		matched?.classType || savedClass || BUDGET_CATEGORY_CLASSES.BASAL;
	const name = matched?.name || savedCategory || "Sem categoria";
	return {
		categoriaMae: name,
		categoriaClasse: classType,
		categoriaClasseLabel: BUDGET_CATEGORY_CLASS_LABELS[classType],
		isBasal: classType === BUDGET_CATEGORY_CLASSES.BASAL,
	};
}

export function enrichFinancialAccountWithCategory(account = {}) {
	return {
		...account,
		...resolveFinancialAccountCategory(account),
	};
}
