const BUDGET_CATEGORY_CLASSES = {
	BASAL: "basal",
	NAO_BASAL: "nao_basal",
	PROJETOS: "projetos",
};

const BUDGET_CATEGORY_CLASS_LABELS = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: "BASAL",
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: "NÃO BASAL",
	[BUDGET_CATEGORY_CLASSES.PROJETOS]: "PROJETOS",
};

const CATEGORY_CLASS_ORDER = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: 0,
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: 1,
	[BUDGET_CATEGORY_CLASSES.PROJETOS]: 2,
};

const FINANCIAL_ACCOUNT_CATEGORY_CATALOG = [
	["Produto", BUDGET_CATEGORY_CLASSES.BASAL, ["Serviços Digitais"]],
	["Transmissão", BUDGET_CATEGORY_CLASSES.BASAL, ["Aluguel Postes", "Aluguel Torres"]],
	["Conservação e reparo predial", BUDGET_CATEGORY_CLASSES.BASAL, ["Manutenção de Imóveis"]],
	[
		"Ocupação",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Aluguel",
			"Água e Esgoto",
			"Segurança e Monitoramento",
			"IPTU",
			"Condomínio",
			"Móveis e Utensílios",
			"Energia Elétrica (Lojas, Escritorios)",
		],
	],
	[
		"Taxas e contribuições",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Contribuição a Entidades de Classe",
			"Taxas Estaduais",
			"Taxas de Expediente",
			"Taxas Municipais",
			"Taxas Federais",
		],
	],
	[
		"Marketing",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Feiras, Congressos e Exposições",
			"Ações de venda",
			"Marketing Institucional",
			"Marketing de relacionamento",
			"Propaganda",
		],
	],
	[
		"Impostos Retenção",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"IRRF s/ PJ",
			"FUST/FUNTEL",
			"CSLL/PIS/COFINS (retenção)",
			"IRRF s/ Aluguel",
			"INSS s/ terceiros",
		],
	],
	[
		"Veículos",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Multas e Infrações",
			"Lavagem",
			"Manutenção Preventiva de Veículos",
			"Manutenção Corretiva de Veículos",
		],
	],
	[
		"Financeiro",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Tarifas e pacotes bancários",
			"IOF",
			"IRRF sobre Aplicações",
			"Tarifas Boletos",
		],
	],
	["Viagens e Estadias", BUDGET_CATEGORY_CLASSES.BASAL, ["Despesas de Viagens e Estadias"]],
	[
		"Administrativo",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
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
	],
	[
		"Terceiros",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Serviços Gráficos",
			"Serviços Contábeis",
			"Serviços Jurídicos",
			"Serviços Prestados - PJ",
			"Serviços de Consultoria",
		],
	],
	["Comercial", BUDGET_CATEGORY_CLASSES.BASAL, ["Comissões PJ"]],
	[
		"TI",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"TI",
			"Infraestrutura de Datacenter",
			"Telefone",
			"Telefonia - STFC",
			"Computadores e Periféricos",
			"Softwares",
		],
	],
	["Interconexão", BUDGET_CATEGORY_CLASSES.BASAL, ["Link Last Mile", "Aluguel de Rack / Cross Conexões", "Link"]],
	[
		"Logística",
		BUDGET_CATEGORY_CLASSES.BASAL,
		["Estacionamento e Pedágios", "Aluguel de Veículos", "Combustíveis - Veículos"],
	],
	[
		"Rede",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Manutenção de Máquinas e Equipamentos",
			"Ferramentas",
			"Equipamentos POP (Switches, OTDR, Baterias)",
			"Energia Elétrica (Torres, POPs, Cessão de Energia)",
			"Rede de Backbone e Rede Ramal",
		],
	],
	[
		"Instalação/Manutenção",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Serviços de Manutenção (técnicos)",
			"Roteador / ONU / Modem",
			"Materiais de Instalação (metais, conectores, etc)",
			"Cabo Drop",
			"Serviços de Instalação (técnicos)",
		],
	],
	[
		"Pessoal",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
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
	],
	["Impostos Sobre Resultado", BUDGET_CATEGORY_CLASSES.BASAL, ["CSLL", "IRPJ"]],
	["Impostos Deduções", BUDGET_CATEGORY_CLASSES.BASAL, ["ICMS dif aliq.", "ISS", "PIS", "COFINS", "ICMS"]],
	["Aquisições", BUDGET_CATEGORY_CLASSES.NAO_BASAL, ["Veículos"]],
	["Dividendos", BUDGET_CATEGORY_CLASSES.NAO_BASAL, ["Lucros a Pagar (Salários e Dividendos)"]],
	[
		"Financeiro",
		BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		["Consórcio", "Empréstimos bancários", "Empréstimos c/ partes relacionadas"],
	],
	[
		"Impostos Parcelamento",
		BUDGET_CATEGORY_CLASSES.NAO_BASAL,
		[
			"COFINS parcelamento",
			"CSLL parcelamento",
			"ICMS parcelamento",
			"IRPJ parcelamento",
			"PIS parcelamento",
		],
	],
].map(([name, classType, accounts]) => ({ name, classType, accounts }));

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
	["irrf sobre aplicacoes", "IRRF sobre Aplicações"],
]);

function normalizeFinancialAccountCategoryKey(value = "") {
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

function normalizeFinancialAccountCategories(
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

function getFinancialAccountCategoryCatalog(customCategories = []) {
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

function resolveFinancialAccountCategory(account = {}, customCategories = []) {
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
	const matched =
		savedCatalogCategory || findCategoryByAccountName(account.nome || account.name, catalog);
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

function enrichFinancialAccountWithCategory(account = {}, customCategories = []) {
	return {
		...account,
		...resolveFinancialAccountCategory(account, customCategories),
	};
}

module.exports = {
	BUDGET_CATEGORY_CLASSES,
	BUDGET_CATEGORY_CLASS_LABELS,
	FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
	enrichFinancialAccountWithCategory,
	getFinancialAccountCategoryCatalog,
	normalizeFinancialAccountCategories,
	normalizeFinancialAccountCategoryKey,
	resolveFinancialAccountCategory,
};
