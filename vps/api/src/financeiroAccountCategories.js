const BUDGET_CATEGORY_CLASSES = {
	BASAL: "basal",
	NAO_BASAL: "nao_basal",
};

const BUDGET_CATEGORY_CLASS_LABELS = {
	[BUDGET_CATEGORY_CLASSES.BASAL]: "BASAL",
	[BUDGET_CATEGORY_CLASSES.NAO_BASAL]: "NÃO BASAL",
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
	["Financeiro", BUDGET_CATEGORY_CLASSES.BASAL, ["Tarifas e pacotes bancários", "Tarifas Boletos"]],
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
	[
		"Comercial",
		BUDGET_CATEGORY_CLASSES.BASAL,
		[
			"Comissões PJ",
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

const CATEGORY_BY_ACCOUNT_KEY = FINANCIAL_ACCOUNT_CATEGORY_CATALOG.flatMap((category) =>
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
	const key = normalizeFinancialAccountCategoryKey(value);
	if (["nao basal", "naobasal", "non basal", "nao_basal"].includes(key)) {
		return BUDGET_CATEGORY_CLASSES.NAO_BASAL;
	}
	if (["basal", "custo basal"].includes(key)) return BUDGET_CATEGORY_CLASSES.BASAL;
	return "";
}

function resolveFinancialAccountCategory(account = {}) {
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

function enrichFinancialAccountWithCategory(account = {}) {
	return {
		...account,
		...resolveFinancialAccountCategory(account),
	};
}

module.exports = {
	BUDGET_CATEGORY_CLASSES,
	BUDGET_CATEGORY_CLASS_LABELS,
	FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
	enrichFinancialAccountWithCategory,
	normalizeFinancialAccountCategoryKey,
	resolveFinancialAccountCategory,
};
