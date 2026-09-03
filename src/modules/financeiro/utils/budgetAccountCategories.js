export const BUDGET_CATEGORY_CLASSES = {
	BASAL: "basal",
	NAO_BASAL: "nao_basal",
	PROJETOS: "projetos",
};

export const BUDGET_CATEGORY_CLASS_LABELS = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: "BASAL",
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: "NÃO BASAL",
	[BUDGET_CATEGORY_CLASSES.PROJETOS]: "PROJETOS",
};

const CATEGORY_CLASS_ORDER = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: 0,
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: 1,
	[BUDGET_CATEGORY_CLASSES.PROJETOS]: 2,
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
	["agua e luz", "Água e Esgoto"],
	["agua esgoto", "Água e Esgoto"],
	["aluguéis", "Aluguel"],
	["alugueis", "Aluguel"],
	["manutencao imoveis", "Manutenção de Imóveis"],
	["tarifa bancaria", "Tarifas e pacotes bancários"],
	["tarifas bancarias", "Tarifas e pacotes bancários"],
	["boleto", "Tarifas Boletos"],
	["boletos", "Tarifas Boletos"],
	["combustivel", "Combustíveis - Veículos"],
	["combustiveis", "Combustíveis - Veículos"],
	["veiculos", "Veículos"],
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

function normalizeCategoryClassType(value = "") {
	const key = normalizeFinancialAccountCategoryKey(value);
	if (["nao basal", "naobasal", "non basal", "nao_basal"].includes(key)) {
		return BUDGET_CATEGORY_CLASSES.NAO_BASAL;
	}
	if (["projeto", "projetos", "projects"].includes(key)) {
		return BUDGET_CATEGORY_CLASSES.PROJETOS;
	}
	if (["basal", "custo basal"].includes(key)) return BUDGET_CATEGORY_CLASSES.BASAL;
	return "";
}

export function normalizeFinancialAccountCategories(
	value = [],
	fallback = FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
) {
	const source = Array.isArray(value) && value.length ? value : fallback;
	const categoryByKey = new Map();
	source.forEach((category) => {
		const rawName =
			typeof category === "string"
				? category
				: category?.name || category?.nome || category?.categoriaMae;
		const name = String(rawName || "").trim();
		if (!name) return;
		const classType =
			normalizeCategoryClassType(
				typeof category === "string"
					? BUDGET_CATEGORY_CLASSES.BASAL
					: category?.classType ||
							category?.categoriaClasse ||
							category?.tipoCategoria,
			) || BUDGET_CATEGORY_CLASSES.BASAL;
		const key = `${classType}:${normalizeFinancialAccountCategoryKey(name)}`;
		const current = categoryByKey.get(key) || {
			name,
			classType,
			accounts: [],
		};
		categoryByKey.set(key, {
			...current,
			name,
			classType,
			accounts: [
				...new Set([
					...(current.accounts || []),
					...(Array.isArray(category?.accounts || category?.contas)
						? category.accounts || category.contas
						: []),
				]),
			],
		});
	});
	return Array.from(categoryByKey.values()).sort((left, right) => {
		if (left.classType !== right.classType) {
			return (
				(CATEGORY_CLASS_ORDER[left.classType] ?? 99) -
				(CATEGORY_CLASS_ORDER[right.classType] ?? 99)
			);
		}
		return left.name.localeCompare(right.name, "pt-BR");
	});
}

export function getFinancialAccountCategoryCatalog(customCategories = []) {
	const defaultByKey = new Map(
		FINANCIAL_ACCOUNT_CATEGORY_CATALOG.map((category) => [
			`${category.classType}:${normalizeFinancialAccountCategoryKey(category.name)}`,
			category,
		]),
	);
	normalizeFinancialAccountCategories(customCategories, []).forEach((category) => {
		const nameKey = normalizeFinancialAccountCategoryKey(category.name);
		const keysWithSameName = Array.from(defaultByKey.keys()).filter((key) =>
			key.endsWith(`:${nameKey}`),
		);
		if (keysWithSameName.length === 1) defaultByKey.delete(keysWithSameName[0]);
		const key = `${category.classType}:${nameKey}`;
		const current = defaultByKey.get(key) || { accounts: [] };
		defaultByKey.set(key, {
			...current,
			name: category.name,
			classType: category.classType,
			accounts: [...new Set([...(current.accounts || []), ...(category.accounts || [])])],
		});
	});
	return normalizeFinancialAccountCategories(Array.from(defaultByKey.values()));
}

function buildCategoryByAccountKey(catalog = FINANCIAL_ACCOUNT_CATEGORY_CATALOG) {
	return catalog
		.flatMap((category) =>
			(category.accounts || []).map((accountName) => [
				normalizeFinancialAccountCategoryKey(accountName),
				{ ...category, accountName },
			]),
		)
		.reduce((map, [key, category]) => map.set(key, category), new Map());
}

function findCategoryByAccountName(name = "", catalog) {
	const normalized = normalizeFinancialAccountCategoryKey(name);
	if (!normalized) return null;
	const categoryByAccountKey = buildCategoryByAccountKey(catalog);
	const alias = ACCOUNT_ALIASES.get(normalized);
	if (alias) return categoryByAccountKey.get(normalizeFinancialAccountCategoryKey(alias));
	const exact = categoryByAccountKey.get(normalized);
	if (exact) return exact;
	for (const [key, category] of categoryByAccountKey.entries()) {
		if (key.length < 4) continue;
		const isPhrase = key.includes(" ");
		const keyPattern = new RegExp(`(^| )${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
		if (keyPattern.test(normalized)) return category;
		if (isPhrase && key.includes(normalized) && normalized.length >= 8) {
			return category;
		}
	}
	return null;
}

function normalizeClassType(value = "") {
	return normalizeCategoryClassType(value);
}

export function resolveFinancialAccountCategory(account = {}, customCategories = []) {
	const catalog = getFinancialAccountCategoryCatalog(customCategories);
	const savedClass = normalizeClassType(
		account.categoriaClasse || account.categoryClass || account.tipoCategoria,
	);
	const savedCategory = String(
		account.categoriaMae || account.categoryName || account.categoria || "",
	).trim();
	const savedCategoryKey = normalizeFinancialAccountCategoryKey(savedCategory);
	const sameNameCategories = catalog.filter(
		(category) =>
			normalizeFinancialAccountCategoryKey(category.name) === savedCategoryKey,
	);
	const savedCatalogCategory =
		(savedClass &&
			sameNameCategories.find((category) => category.classType === savedClass)) ||
		(sameNameCategories.length === 1 ? sameNameCategories[0] : null);
	const matched = savedCatalogCategory || findCategoryByAccountName(account.nome || account.name, catalog);
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

export function enrichFinancialAccountWithCategory(account = {}, customCategories = []) {
	return {
		...account,
		...resolveFinancialAccountCategory(account, customCategories),
	};
}
