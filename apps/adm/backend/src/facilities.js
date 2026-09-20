const express = require("express");
const crypto = require("crypto");
const documents = require("./documents");
const imoveisRepository = require("./imoveisRepository");
const documentosService = require("./documentos/services/documentosService");
const facilitiesKeys = require("./facilitiesKeys");
const emailService = require("./emailService");

const ASSETS_COLLECTION = "facilities_assets";
const INVENTORIES_COLLECTION = "facilities_inventories";
const MOVEMENTS_COLLECTION = "facilities_asset_movements";
const PATRIMONY_CONFIG_COLLECTION = "facilities_patrimonio_config";
const PATRIMONY_CONFIG_PATH = `${PATRIMONY_CONFIG_COLLECTION}/default`;
const SAFETY_ITEMS_COLLECTION = "facilities_safety_items";
const SAFETY_INSPECTIONS_COLLECTION = "facilities_safety_inspections";
const SAFETY_DOCUMENTS_COLLECTION = "facilities_safety_documents";
const SAFETY_NONCONFORMITIES_COLLECTION = "facilities_safety_nonconformities";
const SAFETY_SETTINGS_COLLECTION = "facilities_safety_settings";
const OPERATION_CHECKLISTS_COLLECTION = "facilities_operation_checklists";
const OPERATION_CHECKLIST_RUNS_COLLECTION = "facilities_operation_checklist_runs";
const OPERATION_ROUTINES_COLLECTION = "facilities_operation_routines";
const OPERATION_MAINTENANCE_COLLECTION = "facilities_operation_maintenance";
const OPERATION_INCIDENTS_COLLECTION = "facilities_operation_incidents";
const LOST_FOUND_COLLECTION = "facilities_lost_found";
const SUPPLIERS_COLLECTION = "facilities_suppliers";
const CONTRACTS_COLLECTION = "facilities_contracts";
const CONTRACT_DOCUMENTS_COLLECTION = "facilities_contract_documents";
const CONTRACT_ADJUSTMENTS_COLLECTION = "facilities_contract_adjustments";
const SUPPLIER_EVALUATIONS_COLLECTION = "facilities_supplier_evaluations";
const SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION = "facilities_supplier_evaluation_email_sends";
const CONSUMPTIONS_COLLECTION = "facilities_consumptions";

const DEFAULT_PATRIMONY_CONFIG = Object.freeze({
	categorias: [
		"Mesa",
		"Cadeira",
		"Armário",
		"TV",
		"Geladeira",
		"Micro-ondas",
		"Ar-condicionado",
		"Sofá",
		"Impressora",
		"Bebedouro",
		"Eletrodoméstico",
		"Equipamento predial",
		"Outro",
	],
	codigoPrefixo: "PAT",
	codigoPadding: 6,
	seriePrefixo: "",
	serieObrigatoria: false,
});

const FACILITIES_PERMISSIONS = [
	"facilities.dashboard.view",
	"facilities.imoveis.view",
	"facilities.imoveis.create",
	"facilities.imoveis.edit",
	"facilities.imoveis.deactivate",
	"facilities.imoveis_espacos.view",
	"facilities.patrimonio.view",
	"facilities.patrimonio.create",
	"facilities.patrimonio.edit",
	"facilities.patrimonio.transfer",
	"facilities.patrimonio.deactivate",
	"facilities.patrimonio.qr.export",
	"facilities.patrimonio_inventario.view",
	"facilities.inventario.view",
	"facilities.inventario.execute",
	"facilities.inventario.approve",
	"facilities.acessos_chaves.view",
	"facilities.chaves.view",
	"facilities.chaves.create",
	"facilities.chaves.edit",
	"facilities.chaves.checkout",
	"facilities.chaves.return",
	"facilities.chaves.declare_lost",
	"facilities.chaves.deactivate",
	"facilities.chaves.qr.generate",
	"facilities.chaves.qr.export",
	"facilities.operacao_predial.view",
	"facilities.operacao_predial.manage",
	"facilities.seguranca.view",
	"facilities.seguranca.create",
	"facilities.seguranca.edit",
	"facilities.seguranca.inspect",
	"facilities.seguranca.deactivate",
	"facilities.seguranca_conformidade.view",
	"facilities.fornecedores.view",
	"facilities.fornecedores.manage",
	"facilities.contratos.view",
	"facilities.contratos.manage",
	"facilities.fornecedores_contratos.view",
	"facilities.consumos.view",
	"facilities.consumos.create",
	"facilities.consumos.edit",
	"facilities.consumos.import",
	"facilities.consumos.export",
	"facilities.encargos.view",
	"facilities.encargos.create",
	"facilities.encargos.edit",
	"facilities.anomalias.view",
	"facilities.anomalias.manage",
	"facilities.consumos.settings.manage",
	"facilities.saude.view",
	"facilities.saude.configure",
	"facilities.score.view",
	"facilities.score.details.view",
	"facilities.score.export",
	"facilities.score.configure",
	"facilities.relatorios.view",
	"facilities.manage",
	"view_imoveis_administrativos",
	"administrativo.imoveis.view",
	"administrativo.imoveis.manage",
];

const MODULES = Object.freeze([
	{
		id: "visao-geral",
		title: "Visão Geral",
		path: "/facilities",
		source: "Facilities API",
		status: "ativo",
		description: "Painel consolidado de Facilities no ADM.",
	},
	{
		id: "imoveis-espacos",
		title: "Imóveis & Espaços",
		path: "/facilities/imoveis-espacos",
		source: "Imóveis administrativos",
		status: "integrado",
		description: "Usa imóveis, contratos, anexos, IPTU e aluguel do ADM.",
	},
	{
		id: "patrimonio-inventario",
		title: "Patrimônio",
		path: "/facilities/patrimonio-inventario",
		source: "Facilities / Patrimônio",
		status: "ativo",
		description: "Ativos patrimoniais, movimentações e QR Codes próprios de Facilities.",
	},
	{
		id: "inventarios",
		title: "Inventários",
		path: "/facilities/inventarios",
		source: "Facilities / Patrimônio",
		status: "ativo",
		description: "Conferência física, rastreabilidade e regularização dos ativos patrimoniais.",
	},
	{
		id: "acessos-chaves",
		title: "Acessos & Chaves",
		path: "/facilities/acessos-chaves",
		source: "Facilities / Chaves ADM",
		status: "ativo",
		description: "Controle nativo de chaves do ADM, independente do app Operação.",
	},
	{
		id: "operacao-predial",
		title: "Operação Predial",
		path: "/facilities/operacao-predial",
		source: "Facilities",
		status: "base",
		description: "Checklists, rotinas e ocorrências prediais próprios do ADM.",
	},
	{
		id: "seguranca-conformidade",
		title: "Segurança & Conformidade",
		path: "/facilities/seguranca-conformidade",
		source: "Facilities",
		status: "base",
		description: "Laudos, AVCB, extintores, inspeções e vencimentos críticos.",
	},
	{
		id: "fornecedores-contratos",
		title: "Fornecedores & Contratos",
		path: "/facilities/fornecedores-contratos",
		source: "Imóveis / Documentos",
		status: "integrado",
		description: "Contratos e fornecedores vinculados aos imóveis.",
	},
	{
		id: "consumos",
		title: "Consumos & Custos",
		path: "/facilities/consumos",
		source: "Imóveis administrativos",
		status: "integrado",
		description: "Utilidades, encargos e variações mensais dos imóveis.",
	},
	{
		id: "score",
		title: "Saúde das Unidades",
		path: "/facilities/score",
		source: "Facilities API",
		status: "base",
		description: "Indicador de saúde calculado com pendências, vencimentos, chaves e conformidade.",
	},
	{
		id: "relatorios",
		title: "Relatórios",
		path: "/facilities/relatorios",
		source: "Imóveis / Documentos / Facilities",
		status: "base",
		description: "Relatórios consolidados de Facilities, imóveis, consumos e patrimônio.",
	},
]);

function dataFromRows(rows = []) {
	return rows.map((row) => ({
		id: row.documentId || row.document_id || row.id,
		...(row.data || {}),
	}));
}

function normalizeStatus(value) {
	return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase();
}

function textValue(value) {
	return String(value ?? "").trim();
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const parsed = Number(
		textValue(value)
			.replace(/[R$\s]/g, "")
			.replace(/\.(?=\d{3}(\D|$))/g, "")
			.replace(",", "."),
	);
	return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
}

function daysUntil(value) {
	const date = new Date(value);
	if (!value || Number.isNaN(date.getTime())) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);
	return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

const FACILITY_SCORE_MODEL_VERSION = "v1";
const FACILITY_SCORE_FACTORS = Object.freeze([
	{
		id: "documentos",
		label: "Documentos & Licenças",
		weight: 20,
		metric: "documentosPendentes",
		pointsPerIssue: 2,
		sourceType: "DOCUMENT",
	},
	{
		id: "seguranca",
		label: "Segurança & Conformidade",
		weight: 20,
		metric: "segurancaPendencias",
		pointsPerIssue: 5,
		sourceType: "SAFETY",
	},
	{
		id: "operacao",
		label: "Operação Predial",
		weight: 15,
		metric: "operacaoPendencias",
		pointsPerIssue: 3,
		sourceType: "BUILDING_OPERATION",
	},
	{
		id: "manutencao",
		label: "Manutenção",
		weight: 15,
		metric: "manutencaoPendencias",
		pointsPerIssue: 4,
		sourceType: "MAINTENANCE",
	},
	{
		id: "patrimonio",
		label: "Patrimônio & Inventário",
		weight: 10,
		metric: "inventariosPendentes",
		pointsPerIssue: 2,
		sourceType: "INVENTORY",
	},
	{
		id: "contratos",
		label: "Contratos",
		weight: 10,
		metric: "contratosVencendo",
		pointsPerIssue: 2,
		sourceType: "CONTRACT",
	},
	{
		id: "consumos",
		label: "Consumos & Custos",
		weight: 10,
		metric: "consumosAnomalias",
		pointsPerIssue: 2,
		sourceType: "CONSUMPTION",
	},
]);

function scoreClassification(score) {
	if (score >= 90) return { label: "Excelente", tone: "emerald" };
	if (score >= 75) return { label: "Bom", tone: "emerald" };
	if (score >= 60) return { label: "Atenção", tone: "orange" };
	if (score >= 40) return { label: "Crítico", tone: "red" };
	return { label: "Muito crítico", tone: "red" };
}

function issueSeverity(loss) {
	if (loss >= 8) return "Crítica";
	if (loss >= 5) return "Alta";
	if (loss >= 2) return "Média";
	return "Baixa";
}

function buildFacilityScore(metrics = {}) {
	const totalWeight = FACILITY_SCORE_FACTORS.reduce((total, factor) => total + factor.weight, 0);
	const factors = FACILITY_SCORE_FACTORS.map((factor) => {
		const pending = Number(metrics[factor.metric] || 0);
		const loss = Math.min(factor.weight, pending * factor.pointsPerIssue);
		const score = Math.max(0, factor.weight - loss);
		return {
			...factor,
			pending,
			score,
			loss,
			coverage: pending > 0 || metrics.hasAnyFacilitiesData ? 100 : 0,
			issues: pending > 0
				? [{
					id: `${factor.id}-summary`,
					title: `${pending} pendência(s) em ${factor.label}`,
					sourceType: factor.sourceType,
					sourceId: "",
					criticality: issueSeverity(loss),
					impact: loss,
					status: "Aberta",
					action: "Abrir origem",
				}]
				: [],
		};
	});
	const loss = factors.reduce((total, factor) => total + factor.loss, 0);
	const coverageDomains = factors.filter((factor) => factor.coverage > 0).length;
	const coverage = Math.round((coverageDomains / factors.length) * 100);
	const rawValue = Math.max(0, totalWeight - loss);
	const classification = scoreClassification(rawValue);
	const insufficientData = coverage < 30 && loss === 0;
	return {
		value: insufficientData ? null : rawValue,
		rawValue,
		label: insufficientData ? "Dados insuficientes" : classification.label,
		tone: insufficientData ? "orange" : classification.tone,
		coverage,
		modelVersion: FACILITY_SCORE_MODEL_VERSION,
		totalWeight,
		totalLoss: loss,
		updatedAt: new Date().toISOString(),
		factors,
		issues: factors.flatMap((factor) => factor.issues),
		ranges: [
			{ label: "Excelente", min: 90, max: 100 },
			{ label: "Bom", min: 75, max: 89 },
			{ label: "Atenção", min: 60, max: 74 },
			{ label: "Crítico", min: 40, max: 59 },
			{ label: "Muito crítico", min: 0, max: 39 },
		],
	};
}

function normalizeAsset(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

function normalizeInventory(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

function createDocumentId(prefix) {
	return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function normalizePatrimonyConfig(config = {}) {
	const categorias = Array.isArray(config.categorias)
		? config.categorias.map((item) => String(item || "").trim()).filter(Boolean)
		: [];
	const codigoPadding = Number(config.codigoPadding || DEFAULT_PATRIMONY_CONFIG.codigoPadding);
	return {
		...DEFAULT_PATRIMONY_CONFIG,
		...config,
		categorias: categorias.length ? Array.from(new Set(categorias)) : DEFAULT_PATRIMONY_CONFIG.categorias,
		codigoPrefixo: String(config.codigoPrefixo || DEFAULT_PATRIMONY_CONFIG.codigoPrefixo).trim() || "PAT",
		codigoPadding: Number.isFinite(codigoPadding)
			? Math.min(Math.max(Math.trunc(codigoPadding), 3), 10)
			: DEFAULT_PATRIMONY_CONFIG.codigoPadding,
		seriePrefixo: String(config.seriePrefixo || "").trim(),
		serieObrigatoria: Boolean(config.serieObrigatoria),
	};
}

async function getPatrimonyConfig() {
	const record = await documents.getDocument(PATRIMONY_CONFIG_PATH);
	return normalizePatrimonyConfig(record?.data || {});
}

async function savePatrimonyConfig(payload = {}, currentUser = {}) {
	const current = await getPatrimonyConfig();
	const now = new Date().toISOString();
	const config = normalizePatrimonyConfig({
		...current,
		...payload,
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	});
	await documents.upsertDocument({
		path: PATRIMONY_CONFIG_PATH,
		collectionPath: PATRIMONY_CONFIG_COLLECTION,
		documentId: "default",
		data: config,
	});
	return config;
}

function buildPatrimonyCode(currentCount = 0, config = DEFAULT_PATRIMONY_CONFIG) {
	const normalized = normalizePatrimonyConfig(config);
	return `${normalized.codigoPrefixo}-${String(currentCount + 1).padStart(normalized.codigoPadding, "0")}`;
}

function buildImovelLabel(imovel = {}) {
	return (
		imovel.nome ||
		imovel.titulo ||
		[imovel.classificacao, imovel.cidade, imovel.endereco]
			.filter(Boolean)
			.join(" - ") ||
		imovel.id ||
		"Imóvel"
	);
}

async function resolveImovel(payload = {}) {
	const imoveis = await imoveisRepository.listImoveis();
	const requestedId = String(payload.imovelId || payload.imovel_id || "").trim();
	if (!requestedId && !payload.imovel) {
		return { imovelId: "", imovel: "" };
	}
	const selected = imoveis.find((item) => {
		const id = String(item.id || item.documentId || item.codigo || "").trim();
		return id && id === requestedId;
	});
	if (!selected) {
		const error = new Error("Selecione um imóvel cadastrado para vincular o patrimônio.");
		error.status = 400;
		throw error;
	}
	return {
		imovelId: String(selected.id || selected.documentId || selected.codigo || "").trim(),
		imovel: buildImovelLabel(selected),
	};
}

async function buildFacilitiesDashboard({ user } = {}) {
	const [
		imoveis,
		imoveisDashboard,
		assetsRows,
		inventoriesRows,
		safetyRows,
		safetyInspectionRows,
		suppliersRows,
		contractsRows,
		consumptionsRows,
		movementsRows,
		checklistRows,
		checklistRunRows,
		maintenanceRows,
		incidentRows,
		requisicoesRows,
		documentos,
		keysDashboard,
	] =
		await Promise.all([
			imoveisRepository.listImoveis(),
			imoveisRepository.getDashboardImoveis(),
			documents.listAllDocuments(ASSETS_COLLECTION),
			documents.listAllDocuments(INVENTORIES_COLLECTION),
			documents.listAllDocuments(SAFETY_ITEMS_COLLECTION),
			documents.listAllDocuments(SAFETY_INSPECTIONS_COLLECTION),
			documents.listAllDocuments(SUPPLIERS_COLLECTION),
			documents.listAllDocuments(CONTRACTS_COLLECTION),
			documents.listAllDocuments(CONSUMPTIONS_COLLECTION),
			documents.listAllDocuments(MOVEMENTS_COLLECTION),
			documents.listAllDocuments(OPERATION_CHECKLISTS_COLLECTION),
			documents.listAllDocuments(OPERATION_CHECKLIST_RUNS_COLLECTION),
			documents.listAllDocuments(OPERATION_MAINTENANCE_COLLECTION),
			documents.listAllDocuments(OPERATION_INCIDENTS_COLLECTION),
			documents.listAllDocuments("insumos_administrativos_requisicoes"),
			documentosService.listDocuments({
				status: "pendente",
				limit: 1000,
				offset: 0,
				user,
			}),
			facilitiesKeys.getKeysDashboard().catch(() => null),
		]);

	const assets = assetsRows.map(normalizeAsset).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const inventories = inventoriesRows.map(normalizeInventory).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const safetyItems = safetyRows.map(normalizeSafetyItem).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const safetyInspections = safetyInspectionRows.map(normalizeSafetyInspection).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const suppliers = suppliersRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const contracts = contractsRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const consumptions = consumptionsRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const movements = movementsRows.map(normalizeMovement).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const checklists = checklistRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const checklistRuns = checklistRunRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const maintenance = maintenanceRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const incidents = incidentRows.map(normalizeOperationRecord).filter(
		(item) => normalizeStatus(item.status) !== "excluido",
	);
	const requisicoes = dataFromRows(requisicoesRows);
	const today = new Date().toISOString().slice(0, 10);
	const currentMonth = today.slice(0, 7);
	const previousMonthDate = new Date(`${currentMonth}-01T00:00:00.000Z`);
	previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
	const previousMonth = previousMonthDate.toISOString().slice(0, 7);
	const isOpenStatus = (value) =>
		["aberto", "aberta", "pendente", "em_andamento", "em andamento", "programada", "programado"].includes(
			normalizeStatus(value),
		);
	const sumBy = (rows, predicate = () => true) =>
		rows.filter(predicate).reduce((total, item) => total + numberValue(item.valor || item.value || 0), 0);
	const groupSum = (rows, keyGetter, valueGetter = (item) => numberValue(item.valor || 0)) =>
		rows.reduce((acc, item) => {
			const key = keyGetter(item) || "Outros";
			acc[key] = (acc[key] || 0) + valueGetter(item);
			return acc;
		}, {});
	const customContractsDue = contracts.filter((item) => {
		const remaining = daysUntil(item.fimVigencia || item.dataFim || item.vencimento);
		return remaining !== null && remaining <= 90;
	});
	const due30 = contracts.filter((item) => {
		const remaining = daysUntil(item.fimVigencia || item.dataFim || item.vencimento);
		return remaining !== null && remaining >= 0 && remaining <= 30;
	}).length + Number(imoveisDashboard?.contratos?.vencendo30 || 0);
	const due60 = contracts.filter((item) => {
		const remaining = daysUntil(item.fimVigencia || item.dataFim || item.vencimento);
		return remaining !== null && remaining >= 0 && remaining <= 60;
	}).length + Number(imoveisDashboard?.contratos?.vencendo60 || 0);
	const expiredContracts = contracts.filter((item) => {
		const remaining = daysUntil(item.fimVigencia || item.dataFim || item.vencimento);
		return remaining !== null && remaining < 0;
	}).length + Number(imoveisDashboard?.contratos?.vencidos || 0);
	const consumptionAnomalies = consumptions.filter((item) => {
		const variacao = Number(item.variacaoPercentual || 0);
		return Math.abs(variacao) >= 25 || normalizeStatus(item.status) === "anomalia";
	});
	const monthlyConsumptions = consumptions.filter((item) => String(item.competencia || "").startsWith(currentMonth));
	const previousMonthlyConsumptions = consumptions.filter((item) => String(item.competencia || "").startsWith(previousMonth));
	const monthlyTotal = sumBy(monthlyConsumptions);
	const previousMonthlyTotal = sumBy(previousMonthlyConsumptions);
	const costsVariationPercent = previousMonthlyTotal
		? Number((((monthlyTotal - previousMonthlyTotal) / previousMonthlyTotal) * 100).toFixed(2))
		: null;
	const allMonths = Array.from(new Set(consumptions.map((item) => String(item.competencia || "").slice(0, 7)).filter(Boolean)))
		.sort()
		.slice(-6);
	const assetStatusCounts = groupSum(assets, (item) => normalizeStatus(item.status || "ativo"), () => 1);
	const assetCategories = Object.entries(groupSum(assets, (item) => item.categoria || "Sem categoria", () => 1))
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 8);
	const assetsWithInventory = new Set(
		inventories.flatMap((inventory) =>
			(Array.isArray(inventory.itens) ? inventory.itens : [])
				.map((item) => item.assetId)
				.filter(Boolean),
		),
	);
	const assetsWithoutInventory = assets.filter((asset) => !assetsWithInventory.has(asset.id)).length;
	const inspectionsPending = safetyInspections.filter((item) =>
		["pendente", "nao_conforme", "não conforme"].includes(normalizeStatus(item.status)),
	).length;
	const safetyCriticalItems = safetyItems.filter((item) =>
		["vencido", "em atenção", "em_atencao", "manutencao", "crítico", "critico"].includes(
			normalizeStatus(item.status),
		),
	);
	const complianceTotal = safetyItems.length + safetyInspections.length;
	const complianceCritical = safetyCriticalItems.length + inspectionsPending;
	const complianceRegularPercent = complianceTotal
		? Math.max(0, Math.round(((complianceTotal - complianceCritical) / complianceTotal) * 100))
		: null;
	const contratosVencendo =
		Number(
			imoveisDashboard?.contratos?.vencendo30 ||
				imoveisDashboard?.contratosProximos?.length ||
				0,
		) + customContractsDue.length;
	const documentosPendentes = Array.isArray(documentos) ? documentos.length : 0;
	const ativosEmAtencao = assets.filter((item) =>
		["em manutenção", "em_manutencao", "baixado", "extraviado"].includes(
			normalizeStatus(item.status),
		),
	).length;
	const inventariosPendentes = inventories.filter((item) =>
		["pendente", "em_andamento", "atrasado"].includes(normalizeStatus(item.status)),
	).length;
	const segurancaPendencias =
		safetyItems.filter((item) =>
			["vencido", "em atenção", "em_atencao", "manutencao"].includes(
				normalizeStatus(item.status),
			),
		).length +
		safetyInspections.filter((item) =>
			["nao_conforme", "pendente"].includes(normalizeStatus(item.status)),
		).length;
	const requisicoesPendentes = requisicoes.filter((item) =>
		["pendente", "aprovada", "aguardando_retirada"].includes(
			normalizeStatus(item.status),
		),
	).length;
	const latestItems = [
		...assets.map((item) => ({
			id: item.id,
			tipo: "Patrimônio",
			titulo: item.codigo || item.descricao,
			subtitulo: item.descricao || item.imovel,
			createdAt: item.createdAt || item.updatedAt,
		})),
		...suppliers.map((item) => ({
			id: item.id,
			tipo: "Fornecedor",
			titulo: item.nome,
			subtitulo: item.categoria || item.contato,
			createdAt: item.createdAt || item.updatedAt,
		})),
		...contracts.map((item) => ({
			id: item.id,
			tipo: "Contrato",
			titulo: item.servico || item.codigo,
			subtitulo: item.fornecedor || item.imovel,
			createdAt: item.createdAt || item.updatedAt,
		})),
		...consumptions.map((item) => ({
			id: item.id,
			tipo: "Consumo",
			titulo: `${item.tipo || "Consumo"} · ${item.competencia || ""}`,
			subtitulo: item.imovel,
			createdAt: item.createdAt || item.updatedAt,
		})),
		...movements.map((item) => ({
			id: item.id,
			tipo: "Movimentação",
			titulo: item.assetCodigo || item.assetDescricao || "Patrimônio movimentado",
			subtitulo: `${item.origemImovel || "Origem"} → ${item.destinoImovel || "Destino"}`,
			createdAt: item.createdAt || item.updatedAt,
		})),
		...(keysDashboard?.recentEvents || []).map((item) => ({
			id: item.id,
			tipo: "Chave",
			titulo: item.keyCode || item.keyDescription || "Movimentação de chave",
			subtitulo: item.keyLocation || item.holderName || "Acessos & Chaves",
			createdAt: item.occurredAt || item.createdAt,
		})),
		...maintenance.map((item) => ({
			id: item.id,
			tipo: "Manutenção",
			titulo: item.titulo || item.descricao || "Manutenção predial",
			subtitulo: item.imovel || item.responsavel || "Operação predial",
			createdAt: item.createdAt || item.updatedAt || item.dataProgramada,
		})),
		...incidents.map((item) => ({
			id: item.id,
			tipo: "Ocorrência",
			titulo: item.titulo || item.descricao || "Ocorrência predial",
			subtitulo: item.imovel || item.criticidade || "Operação predial",
			createdAt: item.createdAt || item.updatedAt,
		})),
	]
		.filter((item) => item.titulo)
		.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
		.slice(0, 10);
	const attentionUnits = [
		...inventories
			.filter((item) => normalizeStatus(item.status) !== "concluido")
			.map((item) => ({
				id: `inventory-${item.id}`,
				unit: item.imovel || "Unidade",
				reason: "Inventário pendente",
				severity: "Média",
				sort: 3,
			})),
		...customContractsDue.map((item) => ({
			id: `contract-${item.id}`,
			unit: item.imovel || item.fornecedor || "Contrato",
			reason: "Contrato próximo do vencimento",
			severity: daysUntil(item.fimVigencia || item.dataFim || item.vencimento) <= 30 ? "Alta" : "Média",
			sort: daysUntil(item.fimVigencia || item.dataFim || item.vencimento) <= 30 ? 2 : 3,
		})),
		...consumptionAnomalies.map((item) => ({
			id: `cost-${item.id}`,
			unit: item.imovel || "Unidade",
			reason: `${item.tipo || "Consumo"} fora do padrão`,
			severity: Math.abs(Number(item.variacaoPercentual || 0)) >= 40 ? "Alta" : "Média",
			sort: Math.abs(Number(item.variacaoPercentual || 0)) >= 40 ? 2 : 3,
		})),
		...safetyCriticalItems.map((item) => ({
			id: `safety-${item.id}`,
			unit: item.imovel || item.unidade || item.titulo || "Unidade",
			reason: item.tipo || item.descricao || "Conformidade pendente",
			severity: ["vencido", "crítico", "critico"].includes(normalizeStatus(item.status)) ? "Alta" : "Média",
			sort: ["vencido", "crítico", "critico"].includes(normalizeStatus(item.status)) ? 2 : 3,
		})),
	]
		.sort((a, b) => a.sort - b.sort)
		.slice(0, 20);
	const totalUnits = imoveis.filter((item) => item.ativo !== false).length;
	const criticalUnits = attentionUnits.filter((item) => item.severity === "Crítica" || item.sort === 1).length;
	const warningUnits = Array.from(new Set(attentionUnits.map((item) => item.unit))).length - criticalUnits;

	return {
		ok: true,
		generatedAt: new Date().toISOString(),
		kpis: {
			imoveisAtivos: imoveis.filter((item) => item.ativo !== false).length,
			ativosPatrimoniais: assets.length,
			inventariosPendentes,
			contratosVencendo,
			documentosPendentes,
			ativosEmAtencao,
			requisicoesPendentes,
			segurancaPendencias,
			fornecedoresAtivos: suppliers.filter((item) => normalizeStatus(item.status || "ativo") === "ativo").length,
			contratosFacilities: contracts.length,
			consumosRegistrados: consumptions.length,
			consumosAnomalias: consumptionAnomalies.length,
			facilityScore: buildFacilityScore({
				contratosVencendo,
				documentosPendentes,
				inventariosPendentes,
				segurancaPendencias,
				consumosAnomalias: consumptionAnomalies.length,
				hasAnyFacilitiesData: Boolean(
					imoveis.length ||
						assets.length ||
						inventories.length ||
						safetyItems.length ||
						contracts.length ||
						consumptions.length ||
						documentosPendentes
				),
			}),
		},
		highlights: {
			contratosProximos: [
				...(imoveisDashboard?.contratosProximos || []),
				...customContractsDue,
			].slice(0, 20),
			iptuProximo: imoveisDashboard?.iptuProximo || [],
			aluguelProximo: imoveisDashboard?.aluguelProximo || [],
			fornecedores: suppliers.slice(0, 20),
			contratosFacilities: contracts.slice(0, 20),
			consumosRecentes: consumptions
				.sort((a, b) => String(b.competencia || b.createdAt || "").localeCompare(String(a.competencia || a.createdAt || "")))
				.slice(0, 20),
			consumosAnomalias: consumptionAnomalies.slice(0, 20),
			ultimosItens: latestItems,
			ativosEmAtencao: assets
				.filter((item) => normalizeStatus(item.status) !== "ativo")
				.slice(0, 10),
			inventariosPendentes: inventories
				.filter((item) => normalizeStatus(item.status) !== "concluido")
				.slice(0, 10),
			segurancaPendencias: [
				...safetyItems.filter((item) => normalizeStatus(item.status) !== "ativo"),
				...safetyInspections.filter((item) => normalizeStatus(item.status) === "nao_conforme"),
			].slice(0, 10),
			requisicoesPendentes: requisicoes
				.filter((item) => normalizeStatus(item.status) === "pendente")
				.slice(0, 10),
		},
		health: {
			score: buildFacilityScore({
				contratosVencendo,
				documentosPendentes,
				inventariosPendentes,
				segurancaPendencias,
				consumosAnomalias: consumptionAnomalies.length,
				hasAnyFacilitiesData: Boolean(
					imoveis.length ||
						assets.length ||
						inventories.length ||
						safetyItems.length ||
						contracts.length ||
						consumptions.length ||
						documentosPendentes
				),
			}),
			unitsTotal: totalUnits,
			unitsHealthy: Math.max(0, totalUnits - warningUnits - criticalUnits),
			unitsAttention: Math.max(0, warningUnits),
			unitsCritical: Math.max(0, criticalUnits),
			attentionUnits,
		},
		operations: {
			openIncidents: incidents.filter((item) => isOpenStatus(item.status || item.situacao)).length,
			scheduledMaintenance: maintenance.filter((item) => {
				const date = dateValue(item.dataProgramada || item.prazo || item.vencimento);
				return date && date >= today && isOpenStatus(item.status || "programada");
			}).length,
			overdueChecklists:
				checklists.filter((item) => ["atrasado", "pendente"].includes(normalizeStatus(item.status))).length +
				checklistRuns.filter((item) => ["atrasado", "pendente", "nao_conforme"].includes(normalizeStatus(item.status))).length,
			openRequests: requisicoesPendentes,
			keysInUse: Number(keysDashboard?.checkedOut || 0),
			pendingInventories: inventariosPendentes,
		},
		assetsSummary: {
			total: assets.length,
			inUse: Number(assetStatusCounts.ativo || assetStatusCounts["em uso"] || assetStatusCounts.em_uso || 0),
			stock: Number(assetStatusCounts.estoque || assetStatusCounts["em estoque"] || assetStatusCounts.em_estoque || 0),
			maintenance: Number(assetStatusCounts["em manutenção"] || assetStatusCounts.em_manutencao || assetStatusCounts.manutencao || 0),
			decommissioned: Number(assetStatusCounts.baixado || assetStatusCounts.inativo || 0),
			withoutInventory: assetsWithoutInventory,
			categories: assetCategories,
		},
		contractsSummary: {
			active: contracts.filter((item) => ["ativo", "vigente", ""].includes(normalizeStatus(item.status || "ativo"))).length,
			due30,
			due60,
			expired: expiredContracts,
			withoutDocument: contracts.filter((item) => !item.arquivoUrl && !item.documentoUrl && !item.documentId).length,
			awaitingRenewal: contracts.filter((item) => ["renovacao", "renovação", "aguardando renovacao", "aguardando renovação"].includes(normalizeStatus(item.status))).length,
		},
		complianceSummary: {
			avcbExpired: safetyItems.filter((item) => normalizeText(item.tipo || item.descricao).includes("avcb") && normalizeStatus(item.status) === "vencido").length,
			reportsExpired: safetyItems.filter((item) => normalizeText(item.tipo || item.descricao).includes("laudo") && normalizeStatus(item.status) === "vencido").length,
			inspectionsPending,
			extinguishersDue: safetyItems.filter((item) => normalizeText(item.tipo || item.descricao).includes("extintor") && ["vencendo", "vencido"].includes(normalizeStatus(item.status))).length,
			criticalItems: complianceCritical,
			regularPercent: complianceRegularPercent,
		},
		costsSummary: {
			competence: currentMonth,
			total: monthlyTotal,
			previousTotal: previousMonthlyTotal,
			variationPercent: costsVariationPercent,
			composition: Object.entries(groupSum(monthlyConsumptions, (item) => item.tipo || item.categoria || "Outros"))
				.map(([label, value]) => ({ label, value }))
				.sort((a, b) => b.value - a.value)
				.slice(0, 8),
			evolution: allMonths.map((month) => ({
				month,
				value: sumBy(consumptions, (item) => String(item.competencia || "").startsWith(month)),
			})),
			anomalies: consumptionAnomalies.slice(0, 5),
		},
		recentActivity: latestItems,
		modules: MODULES,
		sources: {
			imoveis: "imoveis_administrativos",
			documentos: "documentos",
			patrimonio: ASSETS_COLLECTION,
			inventarios: INVENTORIES_COLLECTION,
			seguranca: SAFETY_ITEMS_COLLECTION,
			chaves: "facilities_keys",
			fornecedores: SUPPLIERS_COLLECTION,
			contratosFacilities: CONTRACTS_COLLECTION,
			consumosFacilities: CONSUMPTIONS_COLLECTION,
		},
	};
}

async function listAssets() {
	const rows = await documents.listAllDocuments(ASSETS_COLLECTION);
	return rows
		.map(normalizeAsset)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function getPublicAssetByQrToken(token) {
	const cleanToken = String(token || "").trim().replace(/^asset-/, "");
	if (!cleanToken) return null;
	const assets = await listAssets();
	const asset = assets.find((item) =>
		[item.qrToken, item.id, item.codigo]
			.filter(Boolean)
			.map(String)
			.includes(cleanToken),
	);
	if (!asset) return null;
	return {
		id: asset.id,
		kind: "asset",
		code: asset.codigo,
		codigo: asset.codigo,
		description: asset.descricao,
		name: asset.descricao,
		type: asset.categoria,
		categoria: asset.categoria,
		locationDescription: asset.imovel,
		address: asset.imovel,
		environmentId: asset.ambiente,
		ambiente: asset.ambiente,
		status: asset.status,
		statusLabel: asset.status,
		marca: asset.marca,
		modelo: asset.modelo,
		numeroSerie: asset.numeroSerie,
		estado: asset.estado,
		qrToken: asset.qrToken,
		updatedAt: asset.updatedAt,
		source: ASSETS_COLLECTION,
	};
}

async function getPublicQrRecord(token) {
	const cleanToken = String(token || "").trim();
	if (!cleanToken) return null;
	if (cleanToken.startsWith("key-")) {
		return facilitiesKeys.getPublicKeyByQrToken(cleanToken.replace(/^key-/, ""));
	}
	if (cleanToken.startsWith("asset-")) {
		return getPublicAssetByQrToken(cleanToken.replace(/^asset-/, ""));
	}
	const [key, asset] = await Promise.all([
		facilitiesKeys.getPublicKeyByQrToken(cleanToken),
		getPublicAssetByQrToken(cleanToken),
	]);
	return key || asset;
}

async function upsertAsset(payload = {}, currentUser = {}) {
	const [assets, config, imovelInfo] = await Promise.all([
		listAssets(),
		getPatrimonyConfig(),
		resolveImovel(payload),
	]);
	const documentId = payload.id || createDocumentId("asset");
	const now = new Date().toISOString();
	const existing = payload.id
		? assets.find((item) => item.id === payload.id)
		: null;
	const categoria = String(payload.categoria || existing?.categoria || "").trim();
	if (categoria && !config.categorias.includes(categoria)) {
		const error = new Error("Categoria patrimonial inválida. Cadastre a categoria antes de usar.");
		error.status = 400;
		throw error;
	}
	const data = {
		...(existing || {}),
		id: documentId,
		codigo: payload.codigo || existing?.codigo || buildPatrimonyCode(assets.length, config),
		descricao: String(payload.descricao || existing?.descricao || "").trim(),
		categoria: categoria || config.categorias[0] || "Outro",
		marca: String(payload.marca || existing?.marca || "").trim(),
		modelo: String(payload.modelo || existing?.modelo || "").trim(),
		numeroSerie: String(payload.numeroSerie || existing?.numeroSerie || "").trim(),
		dataAquisicao: payload.dataAquisicao || existing?.dataAquisicao || "",
		valorAquisicao: payload.valorAquisicao || existing?.valorAquisicao || "",
		fornecedor: String(payload.fornecedor || existing?.fornecedor || "").trim(),
		garantia: String(payload.garantia || existing?.garantia || "").trim(),
		estado: String(payload.estado || existing?.estado || "Bom").trim(),
		imovelId: imovelInfo.imovelId || existing?.imovelId || "",
		imovel: imovelInfo.imovel || existing?.imovel || "",
		ambiente: String(payload.ambiente || existing?.ambiente || "").trim(),
		responsavel: String(payload.responsavel || existing?.responsavel || "").trim(),
		status: String(payload.status || existing?.status || "Ativo").trim(),
		fotoUrl: payload.fotoUrl || existing?.fotoUrl || "",
		qrToken: existing?.qrToken || crypto.randomBytes(18).toString("base64url"),
		createdAt: existing?.createdAt || now,
		createdBy: existing?.createdBy || currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};

	if (!data.descricao) {
		const error = new Error("Descrição do ativo é obrigatória.");
		error.status = 400;
		throw error;
	}
	if (config.serieObrigatoria && !data.numeroSerie) {
		const error = new Error("Número de série é obrigatório conforme configuração do patrimônio.");
		error.status = 400;
		throw error;
	}

	await documents.upsertDocument({
		path: `${ASSETS_COLLECTION}/${documentId}`,
		collectionPath: ASSETS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function deleteAsset(assetId, currentUser = {}) {
	const cleanId = String(assetId || "").trim();
	if (!cleanId) {
		const error = new Error("Informe o ativo patrimonial.");
		error.status = 400;
		throw error;
	}
	const record = await documents.getDocument(`${ASSETS_COLLECTION}/${cleanId}`);
	const existing = record ? normalizeAsset(record) : null;
	if (!existing || normalizeStatus(existing.status) === "excluido") {
		const error = new Error("Ativo patrimonial não encontrado.");
		error.status = 404;
		throw error;
	}
	const now = new Date().toISOString();
	const data = {
		...existing,
		status: "excluido",
		excluidoEm: now,
		excluidoPor: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${ASSETS_COLLECTION}/${cleanId}`,
		collectionPath: ASSETS_COLLECTION,
		documentId: cleanId,
		data,
	});
	return data;
}

async function listInventories() {
	const rows = await documents.listAllDocuments(INVENTORIES_COLLECTION);
	return rows
		.map(normalizeInventory)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

function normalizeMovement(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

function normalizeSafetyItem(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

function normalizeSafetyInspection(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

function normalizeOperationRecord(row = {}) {
	const data = row.data || row;
	return {
		id: row.documentId || data.id || row.id,
		...data,
		path: row.path || data.path,
		updatedAt: row.updatedAt || data.updatedAt,
	};
}

async function listMovements() {
	const rows = await documents.listAllDocuments(MOVEMENTS_COLLECTION);
	return rows
		.map(normalizeMovement)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listSafetyItems() {
	const rows = await documents.listAllDocuments(SAFETY_ITEMS_COLLECTION);
	return rows
		.map(normalizeSafetyItem)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listSafetyInspections() {
	const rows = await documents.listAllDocuments(SAFETY_INSPECTIONS_COLLECTION);
	return rows
		.map(normalizeSafetyInspection)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listSafetyDocuments() {
	const rows = await documents.listAllDocuments(SAFETY_DOCUMENTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listSafetyNonconformities() {
	const rows = await documents.listAllDocuments(SAFETY_NONCONFORMITIES_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function searchSafetyProperties(query = {}) {
	const q = normalizeStatus(query.q || query.search || "");
	const limit = Math.min(Math.max(Number(query.limit || 8), 1), 20);
	if (q.length < 2) return [];
	const imoveis = await imoveisRepository.listImoveis();
	return imoveis
		.filter((item) =>
			normalizeStatus([
				item.nome,
				item.titulo,
				item.classificacao,
				item.cidade,
				item.estado,
				item.endereco,
				item.codigo,
				item.id,
			].filter(Boolean).join(" ")).includes(q),
		)
		.slice(0, limit)
		.map((item) => ({
			id: String(item.id || item.documentId || item.codigo || "").trim(),
			nome: buildImovelLabel(item),
			cidade: item.cidade || "",
			estado: item.estado || "",
			classificacao: item.classificacao || "",
			endereco: item.endereco || "",
		}));
}

function buildSafetyCode(type = "SEG", currentCount = 0) {
	const prefix = normalizeStatus(type).includes("extintor") ? "EXT" : "SEG";
	return `${prefix}-${String(currentCount + 1).padStart(6, "0")}`;
}

async function upsertSafetyItem(payload = {}, currentUser = {}) {
	const [items, imovelInfo] = await Promise.all([
		listSafetyItems(),
		resolveImovel(payload),
	]);
	const documentId = payload.id || createDocumentId("safety");
	const existing = payload.id ? items.find((item) => item.id === payload.id) : null;
	const now = new Date().toISOString();
	const tipo = String(payload.tipo || existing?.tipo || "Extintor").trim();
	const data = {
		...(existing || {}),
		id: documentId,
		codigo: payload.codigo || existing?.codigo || buildSafetyCode(tipo, items.length),
		tipo,
		descricao: String(payload.descricao || existing?.descricao || tipo).trim(),
		imovelId: imovelInfo.imovelId || existing?.imovelId || "",
		imovel: imovelInfo.imovel || existing?.imovel || "",
		ambiente: String(payload.ambiente || existing?.ambiente || "").trim(),
		localizacaoComplementar: String(payload.localizacaoComplementar || existing?.localizacaoComplementar || "").trim(),
		carga: String(payload.carga || existing?.carga || "").trim(),
		capacidade: String(payload.capacidade || existing?.capacidade || "").trim(),
		fabricante: String(payload.fabricante || existing?.fabricante || "").trim(),
		modelo: String(payload.modelo || existing?.modelo || "").trim(),
		numeroSerie: String(payload.numeroSerie || existing?.numeroSerie || "").trim(),
		dataInstalacao: payload.dataInstalacao || existing?.dataInstalacao || "",
		dataFabricacao: payload.dataFabricacao || existing?.dataFabricacao || "",
		ultimaRecarga: payload.ultimaRecarga || existing?.ultimaRecarga || "",
		proximaRecarga: payload.proximaRecarga || existing?.proximaRecarga || "",
		testeHidrostatico: payload.testeHidrostatico || existing?.testeHidrostatico || "",
		periodicidadeInspecao: String(payload.periodicidadeInspecao || existing?.periodicidadeInspecao || "Mensal").trim(),
		responsavel: String(payload.responsavel || existing?.responsavel || "").trim(),
		observacoes: String(payload.observacoes || existing?.observacoes || payload.observacao || "").trim(),
		ultimaManutencao: payload.ultimaManutencao || existing?.ultimaManutencao || "",
		proximaManutencao: payload.proximaManutencao || existing?.proximaManutencao || "",
		validade: payload.validade || existing?.validade || "",
		fornecedor: String(payload.fornecedor || existing?.fornecedor || "").trim(),
		status: String(payload.status || existing?.status || "Ativo").trim(),
		qrToken: existing?.qrToken || crypto.randomBytes(18).toString("base64url"),
		createdAt: existing?.createdAt || now,
		createdBy: existing?.createdBy || currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.descricao) {
		const error = new Error("Descrição do item de segurança é obrigatória.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${SAFETY_ITEMS_COLLECTION}/${documentId}`,
		collectionPath: SAFETY_ITEMS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createSafetyNonconformity(payload = {}, currentUser = {}) {
	const documentId = payload.id || createDocumentId("nc");
	const now = new Date().toISOString();
	const imovelInfo = payload.imovelId
		? await resolveImovel(payload)
		: { imovelId: String(payload.imovelId || "").trim(), imovel: String(payload.imovel || "").trim() };
	const data = {
		id: documentId,
		codigo: payload.codigo || `NC-${String(Date.now()).slice(-8)}`,
		descricao: String(payload.descricao || "").trim(),
		origem: String(payload.origem || "Registro manual").trim(),
		origemId: String(payload.origemId || "").trim(),
		itemId: String(payload.itemId || "").trim(),
		itemCodigo: String(payload.itemCodigo || "").trim(),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		criticidade: String(payload.criticidade || "Média").trim(),
		responsavel: String(payload.responsavel || currentUser?.displayName || currentUser?.email || "").trim(),
		prazo: payload.prazo || "",
		status: String(payload.status || "Aberta").trim(),
		acaoCorretiva: String(payload.acaoCorretiva || "").trim(),
		evidencia: String(payload.evidencia || "").trim(),
		fornecedor: String(payload.fornecedor || "").trim(),
		custo: numberValue(payload.custo),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.descricao) {
		const error = new Error("Descrição da não conformidade é obrigatória.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${SAFETY_NONCONFORMITIES_COLLECTION}/${documentId}`,
		collectionPath: SAFETY_NONCONFORMITIES_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createSafetyInspection(payload = {}, currentUser = {}) {
	const items = await listSafetyItems();
	const item = items.find((entry) => entry.id === payload.itemId);
	if (!item) {
		const error = new Error("Item de segurança não encontrado.");
		error.status = 404;
		throw error;
	}
	const documentId = createDocumentId("inspection");
	const now = new Date().toISOString();
	const respostas = Array.isArray(payload.respostas) ? payload.respostas : [];
	const naoConformes = respostas.filter((entry) =>
		["nao_conforme", "atenção", "atencao"].includes(normalizeStatus(entry.status)),
	).length;
	const data = {
		id: documentId,
		itemId: item.id,
		itemCodigo: item.codigo,
		itemDescricao: item.descricao,
		imovelId: item.imovelId,
		imovel: item.imovel,
		ambiente: item.ambiente,
		responsavel: String(payload.responsavel || currentUser?.displayName || currentUser?.email || "").trim(),
		respostas,
		observacao: String(payload.observacao || "").trim(),
		status: naoConformes ? "nao_conforme" : "conforme",
		naoConformes,
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${SAFETY_INSPECTIONS_COLLECTION}/${documentId}`,
		collectionPath: SAFETY_INSPECTIONS_COLLECTION,
		documentId,
		data,
	});
	if (naoConformes > 0 && payload.criarNaoConformidade !== false) {
		await createSafetyNonconformity({
			descricao: `Inspeção não conforme em ${item.codigo || item.descricao}`,
			origem: "Inspeção",
			origemId: documentId,
			itemId: item.id,
			itemCodigo: item.codigo,
			imovelId: item.imovelId,
			imovel: item.imovel,
			criticidade: payload.criticidade || "Alta",
			responsavel: payload.responsavel,
			prazo: payload.prazoCorrecao || "",
		}, currentUser);
	}
	return data;
}

async function createSafetyDocument(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const documentId = payload.id || createDocumentId("safety_doc");
	const now = new Date().toISOString();
	const validade = payload.validade || "";
	const dias = daysUntil(validade);
	const statusCalculado = !validade
		? "Sem validade"
		: dias < 0
			? "Vencido"
			: dias <= 60
				? "Vence em breve"
				: "Válido";
	const data = {
		id: documentId,
		tipo: String(payload.tipo || "AVCB").trim(),
		numero: String(payload.numero || "").trim(),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		orgaoEmissor: String(payload.orgaoEmissor || "").trim(),
		dataEmissao: payload.dataEmissao || "",
		validade,
		responsavel: String(payload.responsavel || currentUser?.displayName || currentUser?.email || "").trim(),
		arquivoUrl: String(payload.arquivoUrl || "").trim(),
		observacoes: String(payload.observacoes || "").trim(),
		status: String(payload.status || statusCalculado).trim(),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.tipo || !data.imovelId) {
		const error = new Error("Informe tipo e imóvel do documento de conformidade.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${SAFETY_DOCUMENTS_COLLECTION}/${documentId}`,
		collectionPath: SAFETY_DOCUMENTS_COLLECTION,
		documentId,
		data,
	});
	if (data.status === "Vencido") {
		await createSafetyNonconformity({
			descricao: `${data.tipo} vencido`,
			origem: "Documento vencido",
			origemId: documentId,
			imovelId: data.imovelId,
			imovel: data.imovel,
			criticidade: ["AVCB", "CLCB"].includes(data.tipo) ? "Crítica" : "Alta",
			responsavel: data.responsavel,
		}, currentUser);
	}
	return data;
}

async function listOperationChecklists() {
	const rows = await documents.listAllDocuments(OPERATION_CHECKLISTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listOperationChecklistRuns() {
	const rows = await documents.listAllDocuments(OPERATION_CHECKLIST_RUNS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listLostFound() {
	const rows = await documents.listAllDocuments(LOST_FOUND_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listOperationRoutines() {
	const rows = await documents.listAllDocuments(OPERATION_ROUTINES_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listOperationMaintenance() {
	const rows = await documents.listAllDocuments(OPERATION_MAINTENANCE_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listOperationIncidents() {
	const rows = await documents.listAllDocuments(OPERATION_INCIDENTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function createOperationChecklist(payload = {}, currentUser = {}) {
	const documentId = createDocumentId("checklist");
	const now = new Date().toISOString();
	const itens = Array.isArray(payload.itens)
		? payload.itens.map((item) => String(item || "").trim()).filter(Boolean)
		: String(payload.itens || "")
				.split("\n")
				.map((item) => item.trim())
				.filter(Boolean);
	const data = {
		id: documentId,
		nome: String(payload.nome || "").trim(),
		tipoUnidade: String(payload.tipoUnidade || "Loja").trim(),
		tipoChecklist: String(payload.tipoChecklist || "Abertura").trim(),
		versao: 1,
		itens,
		status: "ativo",
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
	};
	if (!data.nome || !data.itens.length) {
		const error = new Error("Informe nome e pelo menos um item do checklist.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${OPERATION_CHECKLISTS_COLLECTION}/${documentId}`,
		collectionPath: OPERATION_CHECKLISTS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createOperationChecklistRun(payload = {}, currentUser = {}) {
	const checklists = await listOperationChecklists();
	const checklist = checklists.find((item) => item.id === payload.checklistId);
	if (!checklist) {
		const error = new Error("Checklist não encontrado.");
		error.status = 404;
		throw error;
	}
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("checklist_run");
	const now = new Date().toISOString();
	const respostas = Array.isArray(payload.respostas)
		? payload.respostas
		: checklist.itens.map((item) => ({ item, status: "conforme", comentario: "" }));
	const naoConformes = respostas.filter((entry) =>
		["nao_conforme", "atenção", "atencao"].includes(normalizeStatus(entry.status)),
	).length;
	const data = {
		id: documentId,
		checklistId: checklist.id,
		checklistNome: checklist.nome,
		checklistVersao: checklist.versao,
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: String(payload.ambiente || "").trim(),
		responsavel: String(payload.responsavel || currentUser?.displayName || currentUser?.email || "").trim(),
		respostas,
		status: naoConformes ? "atenção" : "conforme",
		naoConformes,
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${OPERATION_CHECKLIST_RUNS_COLLECTION}/${documentId}`,
		collectionPath: OPERATION_CHECKLIST_RUNS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createOperationRoutine(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("routine");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		nome: textValue(payload.nome),
		categoria: textValue(payload.categoria || "Rotina predial"),
		frequencia: textValue(payload.frequencia || "Semanal"),
		proximaExecucao: dateValue(payload.proximaExecucao || payload.dataProgramada || now),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: textValue(payload.ambiente),
		responsavel: textValue(payload.responsavel || currentUser?.displayName || currentUser?.email),
		prioridade: textValue(payload.prioridade || "Média"),
		status: textValue(payload.status || "programada"),
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.nome || !data.imovelId) {
		const error = new Error("Informe nome e imóvel da rotina predial.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${OPERATION_ROUTINES_COLLECTION}/${documentId}`,
		collectionPath: OPERATION_ROUTINES_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createOperationMaintenance(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("maintenance");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		titulo: textValue(payload.titulo),
		tipo: textValue(payload.tipo || "Preventiva"),
		equipamento: textValue(payload.equipamento),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: textValue(payload.ambiente),
		responsavel: textValue(payload.responsavel || currentUser?.displayName || currentUser?.email),
		fornecedor: textValue(payload.fornecedor),
		dataProgramada: dateValue(payload.dataProgramada || payload.proximaExecucao || now),
		prioridade: textValue(payload.prioridade || "Média"),
		status: textValue(payload.status || "programada"),
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.titulo || !data.imovelId) {
		const error = new Error("Informe título e imóvel da manutenção.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${OPERATION_MAINTENANCE_COLLECTION}/${documentId}`,
		collectionPath: OPERATION_MAINTENANCE_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createOperationIncident(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("incident");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		codigo: `OCO-${String(Date.now()).slice(-8)}`,
		titulo: textValue(payload.titulo || payload.descricao),
		tipo: textValue(payload.tipo || "Ocorrência"),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: textValue(payload.ambiente),
		responsavel: textValue(payload.responsavel || currentUser?.displayName || currentUser?.email),
		prioridade: textValue(payload.prioridade || "Média"),
		status: textValue(payload.status || "aberta"),
		descricao: textValue(payload.descricao),
		acaoImediata: textValue(payload.acaoImediata),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.titulo || !data.imovelId) {
		const error = new Error("Informe ocorrência e imóvel vinculado.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${OPERATION_INCIDENTS_COLLECTION}/${documentId}`,
		collectionPath: OPERATION_INCIDENTS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createLostFound(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("lost_found");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		codigo: `ACH-${String(Date.now()).slice(-8)}`,
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: String(payload.ambiente || "").trim(),
		categoria: String(payload.categoria || "Objeto").trim(),
		descricao: String(payload.descricao || "").trim(),
		quemEncontrou: String(payload.quemEncontrou || currentUser?.displayName || currentUser?.email || "").trim(),
		responsavelGuarda: String(payload.responsavelGuarda || "").trim(),
		status: "aguardando_retirada",
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.descricao) {
		const error = new Error("Descrição do achado é obrigatória.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${LOST_FOUND_COLLECTION}/${documentId}`,
		collectionPath: LOST_FOUND_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function listSuppliers() {
	const rows = await documents.listAllDocuments(SUPPLIERS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function searchSuppliers(query = {}) {
	const suppliers = await listSuppliers();
	const q = normalizeStatus(query.q || query.search || "");
	const limit = Math.min(Math.max(Number(query.limit || 8), 1), 20);
	if (q.length < 2) return suppliers.slice(0, limit);
	return suppliers
		.filter((item) => normalizeStatus([
			item.nome,
			item.razaoSocial,
			item.nomeFantasia,
			item.cnpjCpf,
			item.categoria,
			Array.isArray(item.categorias) ? item.categorias.join(" ") : "",
			item.servicos,
			item.contato,
		].filter(Boolean).join(" ")).includes(q))
		.slice(0, limit);
}

async function upsertSupplier(payload = {}, currentUser = {}) {
	const suppliers = await listSuppliers();
	const documentId = payload.id || createDocumentId("supplier");
	const existing = payload.id
		? suppliers.find((item) => item.id === payload.id)
		: null;
	const now = new Date().toISOString();
	const cnpjCpf = textValue(payload.cnpjCpf || payload.cpfCnpj || payload.cnpj || payload.cpf || existing?.cnpjCpf || existing?.cpfCnpj);
	const tipoPessoa = normalizeStatus(payload.tipoPessoa || existing?.tipoPessoa || "juridica").includes("fisica") ? "fisica" : "juridica";
	const duplicate = cnpjCpf
		? suppliers.find((item) => item.id !== documentId && normalizeStatus(item.cnpjCpf) === normalizeStatus(cnpjCpf))
		: null;
	if (duplicate) {
		const error = new Error("Fornecedor já cadastrado com este CPF/CNPJ.");
		error.status = 409;
		throw error;
	}
	const categorias = Array.isArray(payload.categorias)
		? payload.categorias.map(textValue).filter(Boolean)
		: textValue(payload.categoria || existing?.categoria || "Facilities").split(",").map((item) => item.trim()).filter(Boolean);
	const data = {
		...(existing || {}),
		id: documentId,
		nome: textValue(payload.nome || payload.razaoSocial || existing?.nome),
		razaoSocial: textValue(payload.razaoSocial || payload.nome || existing?.razaoSocial || existing?.nome),
		nomeFantasia: textValue(payload.nomeFantasia || existing?.nomeFantasia),
		tipoPessoa,
		categoria: categorias[0] || "Facilities",
		categorias,
		cnpjCpf,
		cpfCnpj: cnpjCpf,
		contato: textValue(payload.contato || existing?.contato),
		responsavelNome: textValue(payload.responsavelNome || payload.contato || existing?.responsavelNome),
		responsavelEmail: textValue(payload.responsavelEmail || payload.email || existing?.responsavelEmail),
		avaliacaoResponsavelNome: textValue(payload.avaliacaoResponsavelNome || payload.responsavelNome || payload.contato || existing?.avaliacaoResponsavelNome),
		avaliacaoResponsavelEmail: textValue(payload.avaliacaoResponsavelEmail || payload.responsavelEmail || payload.email || existing?.avaliacaoResponsavelEmail),
		avaliacaoDiaMensal: numberValue(payload.avaliacaoDiaMensal || existing?.avaliacaoDiaMensal),
		avaliacaoCampos: Array.isArray(payload.avaliacaoCampos) ? payload.avaliacaoCampos.map(textValue).filter(Boolean) : existing?.avaliacaoCampos || [],
		avaliacaoAtiva: payload.avaliacaoAtiva === undefined ? Boolean(existing?.avaliacaoAtiva) : Boolean(payload.avaliacaoAtiva),
		avaliacaoToken: textValue(payload.avaliacaoToken || existing?.avaliacaoToken),
		telefone: textValue(payload.telefone || existing?.telefone),
		email: textValue(payload.email || existing?.email),
		cidadeUf: textValue(payload.cidadeUf || existing?.cidadeUf),
		servicos: textValue(payload.servicos || existing?.servicos),
		sla: textValue(payload.sla || existing?.sla),
		avaliacao: numberValue(payload.avaliacao || existing?.avaliacao),
		criticidade: textValue(payload.criticidade || existing?.criticidade || "Média"),
		status: textValue(payload.status || existing?.status || "Ativo"),
		observacao: textValue(payload.observacao || existing?.observacao),
		createdAt: existing?.createdAt || now,
		createdBy: existing?.createdBy || currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.nome) {
		const error = new Error("Nome do fornecedor é obrigatório.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${SUPPLIERS_COLLECTION}/${documentId}`,
		collectionPath: SUPPLIERS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function listFacilitiesContracts() {
	const rows = await documents.listAllDocuments(CONTRACTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listContractDocuments() {
	const rows = await documents.listAllDocuments(CONTRACT_DOCUMENTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listContractAdjustments() {
	const rows = await documents.listAllDocuments(CONTRACT_ADJUSTMENTS_COLLECTION);
	return rows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
}

async function listSupplierEvaluations() {
	const [evaluationRows, linkRows] = await Promise.all([
		documents.listAllDocuments(SUPPLIER_EVALUATIONS_COLLECTION),
		documents.listAllDocuments(SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION).catch(() => []),
	]);
	const evaluations = evaluationRows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
	const links = linkRows
		.map(normalizeOperationRecord)
		.filter((item) => normalizeStatus(item.status) !== "excluido");
	const matchedEvaluationIds = new Set();
	const rows = links.map((link) => {
		const response = evaluations.find((item) => {
			if (item.fornecedorId !== link.fornecedorId) return false;
			if (link.token && item.token && item.token === link.token) return true;
			if (link.link && item.link && item.link === link.link) return true;
			if (link.competencia && item.competencia && item.competencia === link.competencia) return true;
			return false;
		});
		if (response?.id) matchedEvaluationIds.add(response.id);
		const status = response ? "respondido" : normalizeStatus(link.status) === "erro" ? "erro" : "aguardando_resposta";
		return {
			...link,
			linkId: link.id,
			tipoRegistro: "link_avaliacao",
			status,
			respondido: Boolean(response),
			respondidoEm: response?.createdAt || "",
			respostaId: response?.id || "",
			score: response?.score ?? null,
			metrics: response?.metrics || {},
			criteria: response?.criteria || [],
			feedback: response?.feedback || "",
			alertaCorrecao: response?.alertaCorrecao || false,
			responsavelNome: response?.responsavelNome || link.responsavelNome || "",
			responsavelEmail: response?.responsavelEmail || link.to || link.responsavelEmail || "",
			createdAt: link.sentAt || link.createdAt || link.updatedAt,
		};
	});
	for (const evaluation of evaluations) {
		if (matchedEvaluationIds.has(evaluation.id)) continue;
		rows.push({
			...evaluation,
			tipoRegistro: "resposta_avulsa",
			respondido: true,
			respondidoEm: evaluation.createdAt || "",
			status: "respondido",
		});
	}
	return rows.sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")));
}

async function upsertFacilitiesContract(payload = {}, currentUser = {}) {
	const [contracts, suppliers] = await Promise.all([
		listFacilitiesContracts(),
		listSuppliers(),
	]);
	const imovelInfo = payload.imovelId ? await resolveImovel(payload) : { imovelId: "", imovel: "" };
	const documentId = payload.id || createDocumentId("contract");
	const existing = payload.id
		? contracts.find((item) => item.id === payload.id)
		: null;
	const supplier = suppliers.find((item) => item.id === payload.fornecedorId);
	const now = new Date().toISOString();
	const codigo = textValue(payload.codigo || payload.numero || existing?.codigo) || `CTR-FAC-${String(contracts.length + 1).padStart(6, "0")}`;
	const imoveisIds = Array.isArray(payload.imoveisIds)
		? payload.imoveisIds.map(textValue).filter(Boolean)
		: [imovelInfo.imovelId || existing?.imovelId].filter(Boolean);
	const contratadoTipoPessoa = normalizeStatus(payload.contratadoTipoPessoa || payload.tipoPessoa || supplier?.tipoPessoa || existing?.contratadoTipoPessoa || "juridica").includes("fisica") ? "fisica" : "juridica";
	const diasAtuacao = Array.isArray(payload.diasAtuacao)
		? payload.diasAtuacao.map(textValue).filter(Boolean)
		: textValue(payload.diasAtuacao || existing?.diasAtuacao).split(",").map((item) => item.trim()).filter(Boolean);
	const data = {
		...(existing || {}),
		id: documentId,
		codigo,
		fornecedorId: supplier?.id || textValue(payload.fornecedorId || existing?.fornecedorId),
		fornecedor: supplier?.nome || textValue(payload.fornecedor || existing?.fornecedor),
		fornecedorCategoria: supplier?.categoria || textValue(payload.fornecedorCategoria || existing?.fornecedorCategoria),
		contratadoTipoPessoa,
		contratadoDocumento: textValue(payload.contratadoDocumento || payload.cpfCnpj || payload.cnpjCpf || supplier?.cnpjCpf || existing?.contratadoDocumento),
		contratadoNome: textValue(payload.contratadoNome || supplier?.nome || existing?.contratadoNome),
		tipo: textValue(payload.tipo || payload.servico || existing?.tipo || "Manutenção"),
		servico: textValue(payload.servico || payload.descricao || existing?.servico),
		descricao: textValue(payload.descricao || payload.servico || existing?.descricao),
		imovelId: imovelInfo.imovelId || existing?.imovelId || "",
		imovel: imovelInfo.imovel || existing?.imovel || "",
		imoveisIds,
		imoveis: imovelInfo.imovel ? [imovelInfo.imovel] : existing?.imoveis || [],
		empresa: textValue(payload.empresa || existing?.empresa),
		valorMensal: numberValue(payload.valorMensal ?? payload.valor ?? existing?.valorMensal),
		periodicidadeCobranca: textValue(payload.periodicidadeCobranca || existing?.periodicidadeCobranca || "Mensal"),
		inicioVigencia: dateValue(payload.inicioVigencia || existing?.inicioVigencia),
		fimVigencia: dateValue(payload.fimVigencia || existing?.fimVigencia),
		proximoReajuste: dateValue(payload.proximoReajuste || existing?.proximoReajuste),
		indiceReajuste: textValue(payload.indiceReajuste || existing?.indiceReajuste),
		periodicidadeReajuste: textValue(payload.periodicidadeReajuste || existing?.periodicidadeReajuste || "Anual"),
		sla: textValue(payload.sla || existing?.sla),
		responsavelInterno: textValue(payload.responsavelInterno || existing?.responsavelInterno),
		responsavelFornecedorNome: textValue(payload.responsavelFornecedorNome || payload.contratadoNome || supplier?.responsavelNome || supplier?.contato || existing?.responsavelFornecedorNome),
		responsavelFornecedorEmail: textValue(payload.responsavelFornecedorEmail || supplier?.responsavelEmail || supplier?.email || existing?.responsavelFornecedorEmail),
		diasAtuacao,
		horarioAtuacao: textValue(payload.horarioAtuacao || existing?.horarioAtuacao),
		frequenciaAtuacao: textValue(payload.frequenciaAtuacao || existing?.frequenciaAtuacao),
		escopoLimpeza: textValue(payload.escopoLimpeza || existing?.escopoLimpeza),
		documentos: Array.isArray(payload.documentos) ? payload.documentos : existing?.documentos || [],
		status: textValue(payload.status || existing?.status || "Ativo"),
		observacao: textValue(payload.observacao || existing?.observacao),
		createdAt: existing?.createdAt || now,
		createdBy: existing?.createdBy || currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.servico || !data.fornecedorId) {
		const error = new Error("Informe serviço e fornecedor para o contrato.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${CONTRACTS_COLLECTION}/${documentId}`,
		collectionPath: CONTRACTS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createContractDocument(payload = {}, currentUser = {}) {
	const documentId = createDocumentId("contract_doc");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		contratoId: textValue(payload.contratoId),
		fornecedorId: textValue(payload.fornecedorId),
		tipo: textValue(payload.tipo || "Contrato assinado"),
		numero: textValue(payload.numero),
		dataEmissao: dateValue(payload.dataEmissao),
		validade: dateValue(payload.validade),
		arquivoUrl: textValue(payload.arquivoUrl),
		status: textValue(payload.status || "Válido"),
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${CONTRACT_DOCUMENTS_COLLECTION}/${documentId}`,
		collectionPath: CONTRACT_DOCUMENTS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createContractAdjustment(payload = {}, currentUser = {}) {
	const contracts = await listFacilitiesContracts();
	const contract = contracts.find((item) => item.id === payload.contratoId);
	if (!contract) {
		const error = new Error("Contrato não encontrado.");
		error.status = 404;
		throw error;
	}
	const percentual = numberValue(payload.percentual);
	const valorAnterior = numberValue(payload.valorAnterior || contract.valorMensal);
	const novoValor = numberValue(payload.novoValor || (valorAnterior ? valorAnterior * (1 + percentual / 100) : 0));
	const documentId = createDocumentId("adjustment");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		contratoId: contract.id,
		contratoCodigo: contract.codigo,
		fornecedorId: contract.fornecedorId,
		fornecedor: contract.fornecedor,
		dataBase: dateValue(payload.dataBase || now),
		indice: textValue(payload.indice || contract.indiceReajuste || "IPCA"),
		percentual,
		valorAnterior,
		novoValor,
		status: textValue(payload.status || "Pendente"),
		responsavel: textValue(payload.responsavel || currentUser?.displayName || currentUser?.email),
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${CONTRACT_ADJUSTMENTS_COLLECTION}/${documentId}`,
		collectionPath: CONTRACT_ADJUSTMENTS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function createSupplierEvaluation(payload = {}, currentUser = {}) {
	const suppliers = await listSuppliers();
	const supplier = suppliers.find((item) => item.id === payload.fornecedorId);
	if (!supplier) {
		const error = new Error("Fornecedor não encontrado.");
		error.status = 404;
		throw error;
	}
	const criteria = Array.isArray(payload.criteria)
		? payload.criteria.map((item) => ({
			label: textValue(item.label || item.nome || item.campo),
			rating: Math.min(Math.max(numberValue(item.rating || item.nota || item.valor), 0), 5),
		})).filter((item) => item.label)
		: [];
	const metrics = criteria.length
		? Object.fromEntries(criteria.map((item) => [item.label, item.rating]))
		: {
			sla: numberValue(payload.sla),
			prazo: numberValue(payload.prazo),
			qualidade: numberValue(payload.qualidade),
			atendimento: numberValue(payload.atendimento),
			documentacao: numberValue(payload.documentacao),
			reincidencia: numberValue(payload.reincidencia),
		};
	const values = Object.values(metrics).map(numberValue).filter((value) => value > 0);
	const score = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
	const escala = criteria.length ? "5_estrelas" : "100_pontos";
	const alerta = escala === "5_estrelas" ? score < 3 : score < 60;
	const documentId = createDocumentId("supplier_eval");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		fornecedorId: supplier.id,
		fornecedor: supplier.nome,
		contratoId: textValue(payload.contratoId),
		responsavelNome: textValue(payload.responsavelNome || supplier.avaliacaoResponsavelNome || supplier.responsavelNome || supplier.contato),
		responsavelEmail: textValue(payload.responsavelEmail || supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email),
		competencia: textValue(payload.competencia || now.slice(0, 7)),
		escala,
		score,
		metrics,
		criteria,
		feedback: textValue(payload.feedback || payload.observacao),
		token: textValue(payload.token),
		link: textValue(payload.link),
		status: textValue(payload.status || (alerta ? "alerta_correcao" : "avaliado")),
		alertaCorrecao: alerta,
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${SUPPLIER_EVALUATIONS_COLLECTION}/${documentId}`,
		collectionPath: SUPPLIER_EVALUATIONS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

function publicSupplierEvaluationFields(supplier = {}) {
	return Array.isArray(supplier.avaliacaoCampos) && supplier.avaliacaoCampos.length
		? supplier.avaliacaoCampos.map(textValue).filter(Boolean)
		: ["Atendimento", "Prazo", "Qualidade", "Comunicação", "Documentação"];
}

async function getPublicSupplierEvaluation(token = "", fornecedorId = "") {
	const cleanToken = textValue(token);
	if (!cleanToken) return null;
	const suppliers = await listSuppliers();
	const supplier = suppliers.find((item) => {
		const sameToken = textValue(item.avaliacaoToken) === cleanToken;
		const sameSupplier = !fornecedorId || textValue(item.id) === textValue(fornecedorId);
		return sameToken && sameSupplier;
	});
	if (!supplier || supplier.avaliacaoAtiva === false) return null;
	const [contracts, evaluations] = await Promise.all([
		listFacilitiesContracts(),
		documents.listAllDocuments(SUPPLIER_EVALUATIONS_COLLECTION).catch(() => []),
	]);
	const competence = new Date().toISOString().slice(0, 7);
	const alreadySubmitted = evaluations
		.map(normalizeOperationRecord)
		.find((item) => (
			item.fornecedorId === supplier.id
			&& textValue(item.token) === cleanToken
			&& textValue(item.competencia || competence) === competence
			&& normalizeStatus(item.status) !== "excluido"
		));
	return {
		fornecedor: {
			id: supplier.id,
			nome: supplier.nome,
			categoria: supplier.categoria,
			contato: supplierEvaluationResponsibleName(supplier),
			email: supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email,
			campos: publicSupplierEvaluationFields(supplier),
		},
		competencia: competence,
		respondido: Boolean(alreadySubmitted),
		resposta: alreadySubmitted ? {
			id: alreadySubmitted.id,
			score: alreadySubmitted.score,
			feedback: alreadySubmitted.feedback,
			createdAt: alreadySubmitted.createdAt,
		} : null,
		contracts: contracts.filter((item) => item.fornecedorId === supplier.id).map((item) => ({
			id: item.id,
			codigo: item.codigo,
			servico: item.servico,
			status: item.status,
		})),
	};
}

async function submitPublicSupplierEvaluation(token = "", payload = {}) {
	const context = await getPublicSupplierEvaluation(token, payload.fornecedorId);
	if (!context?.fornecedor) {
		const error = new Error("Link de avaliação inválido ou expirado.");
		error.status = 404;
		throw error;
	}
	if (context.respondido) {
		const error = new Error("Esta avaliação já foi enviada para a competência atual.");
		error.status = 409;
		throw error;
	}
	const supplier = context.fornecedor;
	const criteria = Array.isArray(payload.criteria)
		? payload.criteria
		: publicSupplierEvaluationFields({ avaliacaoCampos: supplier.campos }).map((label) => ({
			label,
			rating: numberValue(payload[label]),
		}));
	return createSupplierEvaluation({
		...payload,
		fornecedorId: supplier.id,
		responsavelNome: payload.responsavelNome || supplier.contato,
		responsavelEmail: payload.responsavelEmail || supplier.email,
		token,
		criteria,
		status: undefined,
	}, {
		email: supplier.email || "avaliacao-publica@adm.local",
		displayName: supplier.contato || "Avaliação pública",
		uid: "public-supplier-evaluation",
	});
}

function daysInMonth(year, monthIndex) {
	return new Date(year, monthIndex + 1, 0).getDate();
}

function supplierEvaluationPublicUrl(supplier = {}) {
	const baseUrl = textValue(process.env.ADM_PUBLIC_URL || process.env.FRONTEND_PUBLIC_URL || process.env.APP_PUBLIC_URL || "https://adm.retiradas.tech").replace(/\/+$/, "");
	const token = textValue(supplier.avaliacaoToken);
	if (!token) return "";
	return `${baseUrl}/avaliacao-fornecedor?fornecedor=${encodeURIComponent(supplier.id || "")}&token=${encodeURIComponent(token)}`;
}

function looksLikePhoneOrDocument(value = "") {
	const text = textValue(value);
	if (!text) return false;
	const digits = text.replace(/\D/g, "");
	const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
	return digits.length >= 8 && letters.length < 3;
}

function supplierEvaluationResponsibleName(supplier = {}, fallback = "responsável") {
	const candidates = [
		supplier.avaliacaoResponsavelNome,
		supplier.responsavelNome,
		supplier.contato,
		supplier.nomeFantasia,
		supplier.nome,
		supplier.razaoSocial,
	];
	return candidates.map(textValue).find((name) => name && !looksLikePhoneOrDocument(name)) || fallback;
}

async function sendSupplierEvaluationEmail(supplier = {}, { now = new Date() } = {}) {
	const to = textValue(supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email);
	const link = supplierEvaluationPublicUrl(supplier);
	if (!to || !link) return { sent: false, reason: "missing_recipient_or_token" };
	const competence = now.toISOString().slice(0, 7);
	const responsibleName = supplierEvaluationResponsibleName(supplier);
	await emailService.sendMail({
		to,
		subject: `Avaliação mensal de fornecedor - ${supplier.nome}`,
		text: `Olá ${responsibleName}, avalie o fornecedor ${supplier.nome}: ${link}`,
		html: `
			<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
				<div style="padding:20px;border-radius:18px;background:#0757d8;color:#fff">
					<p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Administrativo | Cluster MG</p>
					<h1 style="margin:8px 0 0;font-size:24px">Avaliação mensal de fornecedor</h1>
				</div>
				<div style="padding:22px;border:1px solid #dbe4f0;border-radius:18px;margin-top:16px;background:#fff">
					<p style="font-size:15px;line-height:1.5">Olá <strong>${responsibleName}</strong>,</p>
					<p style="font-size:15px;line-height:1.5">Precisamos da sua avaliação mensal do fornecedor <strong>${supplier.nome}</strong> referente à competência <strong>${competence}</strong>.</p>
					<p style="margin:24px 0">
						<a href="${link}" style="display:inline-block;background:#0757d8;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px">Avaliar fornecedor</a>
					</p>
					<p style="font-size:12px;color:#64748b">Se o botão não abrir, copie este link: ${link}</p>
				</div>
			</div>
		`,
		meta: {
			type: "facilities_supplier_evaluation",
			supplierId: supplier.id,
			competence,
		},
	});
	return { sent: true, link, competence };
}

async function createSupplierEvaluationLink(payload = {}, currentUser = {}) {
	const suppliers = await listSuppliers();
	const supplier = suppliers.find((item) => item.id === payload.fornecedorId);
	if (!supplier) {
		const error = new Error("Fornecedor não encontrado.");
		error.status = 404;
		throw error;
	}
	const now = new Date();
	const token = textValue(payload.token || payload.avaliacaoToken || supplier.avaliacaoToken) || `sup-${supplier.id}-${crypto.randomBytes(8).toString("hex")}`;
	const fields = Array.isArray(payload.avaliacaoCampos)
		? payload.avaliacaoCampos.map(textValue).filter(Boolean)
		: publicSupplierEvaluationFields(supplier);
	const updatedSupplier = await upsertSupplier({
		...supplier,
		avaliacaoToken: token,
		avaliacaoCampos: fields,
		avaliacaoAtiva: true,
		avaliacaoResponsavelNome: supplierEvaluationResponsibleName({
			...supplier,
			avaliacaoResponsavelNome: payload.responsavelNome || supplier.avaliacaoResponsavelNome,
		}),
		avaliacaoResponsavelEmail: textValue(payload.responsavelEmail || supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email),
		avaliacaoDiaMensal: payload.avaliacaoDiaMensal || supplier.avaliacaoDiaMensal || 5,
	}, currentUser);
	let sendResult = {};
	let sendError = "";
	try {
		sendResult = await sendSupplierEvaluationEmail(updatedSupplier, { now });
	} catch (error) {
		sendError = error?.message || String(error);
	}
	const documentId = createDocumentId("supplier_eval_link");
	const link = sendResult.link || supplierEvaluationPublicUrl(updatedSupplier);
	const data = {
		id: documentId,
		fornecedorId: updatedSupplier.id,
		fornecedor: updatedSupplier.nome,
		competencia: sendResult.competence || now.toISOString().slice(0, 7),
		to: textValue(updatedSupplier.avaliacaoResponsavelEmail || updatedSupplier.responsavelEmail || updatedSupplier.email),
		responsavelNome: supplierEvaluationResponsibleName(updatedSupplier),
		responsavelEmail: textValue(updatedSupplier.avaliacaoResponsavelEmail || updatedSupplier.responsavelEmail || updatedSupplier.email),
		token,
		link,
		status: sendError ? "erro" : sendResult.sent ? "enviado" : "link_gerado",
		reason: sendResult.reason || "",
		error: sendError,
		sentAt: sendResult.sent ? now.toISOString() : "",
		createdAt: now.toISOString(),
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now.toISOString(),
	};
	await documents.upsertDocument({
		path: `${SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION}/${documentId}`,
		collectionPath: SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function runSupplierEvaluationEmailRoutine({ now = new Date() } = {}) {
	const suppliers = await listSuppliers();
	const year = now.getFullYear();
	const month = now.getMonth();
	const today = now.getDate();
	const competence = now.toISOString().slice(0, 7);
	const results = { checked: 0, sent: 0, skipped: 0, errors: 0 };
	for (const supplier of suppliers) {
		if (!supplier.avaliacaoAtiva) continue;
		const email = textValue(supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email);
		const token = textValue(supplier.avaliacaoToken);
		if (!email || !token) continue;
		const configuredDay = Math.min(Math.max(numberValue(supplier.avaliacaoDiaMensal || 5), 1), 28);
		const dueDay = Math.min(configuredDay, daysInMonth(year, month));
		if (dueDay !== today) continue;
		results.checked += 1;
		const documentId = `${competence}_${supplier.id}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
		const path = `${SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION}/${documentId}`;
		const alreadySent = await documents.getDocument(path).catch(() => null);
		if (alreadySent?.data?.sentAt || alreadySent?.sentAt) {
			results.skipped += 1;
			continue;
		}
		try {
			const sendResult = await sendSupplierEvaluationEmail(supplier, { now });
			await documents.upsertDocument({
				path,
				collectionPath: SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION,
				documentId,
				data: {
					id: documentId,
					fornecedorId: supplier.id,
					fornecedor: supplier.nome,
					competencia: competence,
					to: email,
					link: sendResult.link || supplierEvaluationPublicUrl(supplier),
					status: sendResult.sent ? "enviado" : "ignorado",
					reason: sendResult.reason || "",
					sentAt: sendResult.sent ? now.toISOString() : "",
					updatedAt: now.toISOString(),
				},
			});
			if (sendResult.sent) results.sent += 1;
			else results.skipped += 1;
		} catch (error) {
			results.errors += 1;
			await documents.upsertDocument({
				path,
				collectionPath: SUPPLIER_EVALUATION_EMAIL_SENDS_COLLECTION,
				documentId,
				data: {
					id: documentId,
					fornecedorId: supplier.id,
					fornecedor: supplier.nome,
					competencia: competence,
					to: email,
					status: "erro",
					error: error?.message || String(error),
					updatedAt: now.toISOString(),
				},
			}).catch(() => {});
		}
	}
	return results;
}

const CONSUMPTION_TYPES = new Set(["energia", "agua", "água", "gas", "gás", "internet", "telecom", "outros consumos", "outros"]);
const COST_TYPES = new Set(["condominio", "condomínio", "iptu", "taxas", "taxas municipais", "taxas extraordinarias", "taxas extraordinárias", "seguro do imovel", "seguro do imóvel", "outros encargos"]);

function classifyConsumptionType(type = "") {
	const normalized = normalizeText(type);
	if (COST_TYPES.has(normalized)) return "encargo";
	if (CONSUMPTION_TYPES.has(normalized)) return "consumo";
	return normalized.includes("condominio") || normalized.includes("iptu") || normalized.includes("taxa") || normalized.includes("seguro")
		? "encargo"
		: "consumo";
}

function filterConsumptions(items = [], query = {}) {
	const competence = textValue(query.competencia);
	const category = textValue(query.categoria);
	const type = normalizeText(query.tipo);
	const propertyId = textValue(query.imovelId || query.propertyId);
	const supplier = normalizeText(query.fornecedor || query.supplier);
	const status = normalizeText(query.status);
	const search = normalizeText(query.q || query.search);
	return items.filter((item) => {
		if (competence && item.competencia !== competence) return false;
		if (category && item.categoria !== category) return false;
		if (type && normalizeText(item.tipo) !== type) return false;
		if (propertyId && item.imovelId !== propertyId) return false;
		if (supplier && !normalizeText(item.fornecedor).includes(supplier)) return false;
		if (status && normalizeText(item.status) !== status) return false;
		if (search) {
			const haystack = normalizeText([item.imovel, item.tipo, item.fornecedor, item.codigoCliente, item.referencia, item.numeroDocumento].filter(Boolean).join(" "));
			if (!haystack.includes(search)) return false;
		}
		return true;
	});
}

function currentCompetence() {
	return new Date().toISOString().slice(0, 7);
}

function consumptionMergeKey(item = {}) {
	return [
		textValue(item.imovelId || item.propertyId),
		normalizeText(item.tipo),
		textValue(item.competencia),
	].join("|");
}

function buildAutomaticConsumptionFromProperty(imovel = {}, type = "Energia", competence = currentCompetence()) {
	const normalizedType = normalizeText(type);
	const isWater = normalizedType.includes("agua");
	const value = numberValue(isWater ? imovel.aguaValorMedio : imovel.energiaValorMedio);
	const customerCode = textValue(isWater ? imovel.aguaCodigoCliente : imovel.energiaCodigoCliente);
	if (!value && !customerCode) return null;
	const imovelId = textValue(imovel.id || imovel.imovelId || imovel.codigo || imovel.idSenior);
	const imovelName = textValue(imovel.nome || imovel.titulo || imovel.name || imovel.enderecoCompleto || imovel.endereco || imovelId);
	if (!imovelId || !imovelName) return null;
	return {
		id: `auto-${imovelId}-${normalizedType || "consumo"}-${competence}`.replace(/[^a-zA-Z0-9_-]/g, "-"),
		imovelId,
		imovel: imovelName,
		categoria: "consumo",
		tipo: isWater ? "Água" : "Energia",
		competencia: textValue(competence || currentCompetence()),
		consumo: 0,
		unidade: isWater ? "m³" : "kWh",
		valor: value,
		fornecedor: isWater ? "Água / Saneamento" : "Energia elétrica",
		codigoCliente: customerCode,
		status: "automatico",
		origem: "imoveis",
		automatico: true,
		observacao: "Gerado automaticamente a partir do cadastro do imóvel.",
	};
}

function buildAutomaticConsumptionsFromProperties(imoveis = [], competence = currentCompetence()) {
	return imoveis
		.flatMap((imovel) => [
			buildAutomaticConsumptionFromProperty(imovel, "Energia", competence),
			buildAutomaticConsumptionFromProperty(imovel, "Água", competence),
		])
		.filter(Boolean);
}

async function listConsumptions(query = {}) {
	const [rows, imoveis] = await Promise.all([
		documents.listAllDocuments(CONSUMPTIONS_COLLECTION),
		imoveisRepository.listImoveis().catch(() => []),
	]);
	const manualItems = rows
		.map(normalizeOperationRecord)
		.map((item) => ({
			...item,
			categoria: item.categoria || classifyConsumptionType(item.tipo),
		}))
		.filter((item) => normalizeStatus(item.status) !== "excluido");
	const competence = textValue(query.competencia) || currentCompetence();
	const manualKeys = new Set(manualItems.map(consumptionMergeKey));
	const automaticItems = buildAutomaticConsumptionsFromProperties(imoveis, competence)
		.filter((item) => !manualKeys.has(consumptionMergeKey(item)));
	const items = [...manualItems, ...automaticItems];
	return filterConsumptions(items, query);
}

async function createConsumption(payload = {}, currentUser = {}) {
	const imovelInfo = await resolveImovel(payload);
	const consumptions = await listConsumptions();
	const previous = consumptions
		.filter((item) => item.imovelId === imovelInfo.imovelId && item.tipo === payload.tipo)
		.sort((a, b) => String(b.competencia || "").localeCompare(String(a.competencia || "")))[0];
	const documentId = payload.id || createDocumentId("consumption");
	const now = new Date().toISOString();
	const tipo = textValue(payload.tipo || "Energia");
	const categoria = textValue(payload.categoria || classifyConsumptionType(tipo));
	const leituraAnterior = numberValue(payload.leituraAnterior);
	const leituraAtual = numberValue(payload.leituraAtual);
	const valor = numberValue(payload.valor);
	const consumoInformado = numberValue(payload.consumo);
	const consumo = leituraAtual > 0 && leituraAnterior > 0 && leituraAtual >= leituraAnterior
		? Number((leituraAtual - leituraAnterior).toFixed(2))
		: consumoInformado;
	const previousValue = numberValue(previous?.valor);
	const variacaoPercentual = previousValue > 0
		? Number((((valor - previousValue) / previousValue) * 100).toFixed(2))
		: 0;
	const status = Math.abs(variacaoPercentual) >= numberValue(payload.threshold || 25) ? "variacao_relevante" : "registrado";
	const data = {
		id: documentId,
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		categoria,
		tipo,
		competencia: textValue(payload.competencia || new Date().toISOString().slice(0, 7)),
		consumo,
		unidade: textValue(payload.unidade || "kWh"),
		valor,
		vencimento: dateValue(payload.vencimento),
		dataLeitura: dateValue(payload.dataLeitura),
		dataEmissao: dateValue(payload.dataEmissao),
		fornecedor: textValue(payload.fornecedor),
		codigoCliente: textValue(payload.codigoCliente),
		leituraAtual,
		leituraAnterior,
		plano: textValue(payload.plano),
		velocidade: textValue(payload.velocidade),
		exercicio: textValue(payload.exercicio),
		numeroParcelas: numberValue(payload.numeroParcelas),
		parcela: textValue(payload.parcela),
		valorAnual: numberValue(payload.valorAnual),
		valorOrdinario: numberValue(payload.valorOrdinario),
		valorExtraordinario: numberValue(payload.valorExtraordinario),
		contratoId: textValue(payload.contratoId),
		documentoUrl: textValue(payload.documentoUrl || payload.arquivoUrl),
		numeroDocumento: textValue(payload.numeroDocumento),
		variacaoPercentual,
		status,
		anomalyStatus: status === "variacao_relevante" ? "detectada" : "",
		observacao: textValue(payload.observacao),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	if (!data.imovelId || !data.tipo || !data.competencia) {
		const error = new Error("Informe imóvel, tipo e competência do consumo.");
		error.status = 400;
		throw error;
	}
	await documents.upsertDocument({
		path: `${CONSUMPTIONS_COLLECTION}/${documentId}`,
		collectionPath: CONSUMPTIONS_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function buildFacilitiesReport({ user } = {}) {
	const [dashboard, assets, inventories, suppliers, contracts, consumptions] =
		await Promise.all([
			buildFacilitiesDashboard({ user }),
			listAssets(),
			listInventories(),
			listSuppliers(),
			listFacilitiesContracts(),
			listConsumptions(),
		]);
	const consumoTotal = consumptions.reduce(
		(total, item) => total + numberValue(item.valor),
		0,
	);
	const contratosTotalMensal = contracts.reduce(
		(total, item) => total + numberValue(item.valorMensal),
		0,
	);
	return {
		ok: true,
		generatedAt: new Date().toISOString(),
		summary: {
			...(dashboard.kpis || {}),
			fornecedores: suppliers.length,
			contratos: contracts.length,
			contratosTotalMensal,
			consumos: consumptions.length,
			consumoTotal,
			patrimonio: assets.length,
			inventarios: inventories.length,
		},
		highlights: dashboard.highlights || {},
		patrimonio: assets.slice(0, 500),
		inventarios: inventories.slice(0, 500),
		fornecedores: suppliers.slice(0, 500),
		contratos: contracts.slice(0, 500),
		consumos: consumptions.slice(0, 500),
	};
}

async function createInventory(payload = {}, currentUser = {}) {
	const assets = await listAssets();
	const imovelInfo = await resolveImovel(payload);
	const documentId = createDocumentId("inventory");
	const now = new Date().toISOString();
	const scopedAssets = assets.filter((asset) => {
		if (imovelInfo.imovelId) {
			const expectedKeys = [imovelInfo.imovelId, imovelInfo.imovel].filter(Boolean).map(normalizeText);
			const assetKeys = [asset.imovelId, asset.imovel, asset.localizacao, asset.unidade].filter(Boolean).map(normalizeText);
			if (!expectedKeys.some((key) => assetKeys.includes(key))) return false;
		}
		if (payload.ambiente && normalizeText(asset.ambiente) !== normalizeText(payload.ambiente)) return false;
		return true;
	});
	if (!scopedAssets.length) {
		const error = new Error("Nenhum ativo foi encontrado para o escopo selecionado.");
		error.status = 400;
		throw error;
	}
	const data = {
		id: documentId,
		codigo: `INV-${String(Date.now()).slice(-8)}`,
		nome: textValue(payload.nome || `Inventário ${imovelInfo.imovel || "Facilities"} — ${new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`),
		imovelId: imovelInfo.imovelId,
		imovel: imovelInfo.imovel,
		ambiente: String(payload.ambiente || "").trim(),
		responsavel: String(payload.responsavel || currentUser?.displayName || currentUser?.email || "").trim(),
		status: "em_andamento",
		scope: {
			imovelId: imovelInfo.imovelId,
			imovel: imovelInfo.imovel,
			ambiente: String(payload.ambiente || "").trim(),
			categoria: textValue(payload.categoria),
			responsavel: textValue(payload.responsavel),
		},
		esperados: scopedAssets.length,
		encontrados: 0,
		pendentes: scopedAssets.length,
		ausentes: 0,
		extras: 0,
		divergencias: 0,
		itens: scopedAssets.map((asset) => ({
			assetId: asset.id,
			codigo: asset.codigo,
			descricao: asset.descricao,
			categoria: asset.categoria || "",
			numeroSerie: asset.numeroSerie || "",
			imovelId: asset.imovelId || "",
			imovel: asset.imovel || "",
			ambiente: asset.ambiente || "",
			responsavel: asset.responsavel || "",
			expectedStatus: asset.status || "",
			status: "pendente",
		})),
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
		updatedAt: now,
	};
	await documents.upsertDocument({
		path: `${INVENTORIES_COLLECTION}/${documentId}`,
		collectionPath: INVENTORIES_COLLECTION,
		documentId,
		data,
	});
	return data;
}

async function updateInventory(id, payload = {}, currentUser = {}) {
	const documentId = String(id || payload.id || "").trim();
	if (!documentId) {
		const error = new Error("Inventário não informado.");
		error.status = 400;
		throw error;
	}
	const currentRecord = await documents.getDocument(`${INVENTORIES_COLLECTION}/${documentId}`);
	const current = normalizeInventory(currentRecord || {});
	if (!current?.id) {
		const error = new Error("Inventário não encontrado.");
		error.status = 404;
		throw error;
	}
	const incomingItems = Array.isArray(payload.itens) ? payload.itens : current.itens || [];
	const itens = incomingItems.map((item = {}) => ({
		assetId: String(item.assetId || item.id || "").trim(),
		codigo: String(item.codigo || "").trim(),
		descricao: String(item.descricao || "").trim(),
		categoria: String(item.categoria || "").trim(),
		numeroSerie: String(item.numeroSerie || "").trim(),
		imovelId: String(item.imovelId || "").trim(),
		imovel: String(item.imovel || "").trim(),
		ambiente: String(item.ambiente || "").trim(),
		responsavel: String(item.responsavel || "").trim(),
		expectedStatus: String(item.expectedStatus || "").trim(),
		status: String(item.status || "pendente").trim() || "pendente",
		observacao: String(item.observacao || "").trim(),
		conferidoEm: item.conferidoEm || "",
		conferidoPor: item.conferidoPor || currentUser?.email || currentUser?.uid || "",
	}));
	const encontrados = itens.filter((item) => normalizeStatus(item.status) === "encontrado").length;
	const pendentes = itens.filter((item) => normalizeStatus(item.status) === "pendente").length;
	const ausentes = itens.filter((item) => normalizeStatus(item.status) === "ausente").length;
	const extras = itens.filter((item) => normalizeStatus(item.status) === "extra").length;
	const divergencias = itens.filter((item) =>
		["ausente", "divergente", "nao_localizado", "não localizado", "extra"].includes(normalizeStatus(item.status)),
	).length;
	const esperados = Number(payload.esperados ?? current.esperados ?? itens.filter((item) => normalizeStatus(item.status) !== "extra").length);
	const explicitStatus = String(payload.status || "").trim();
	const status = explicitStatus || (itens.length && itens.every((item) => normalizeStatus(item.status) !== "pendente") ? "concluido" : "em_andamento");
	const data = {
		...current,
		...payload,
		id: documentId,
		itens,
		status,
		esperados,
		encontrados,
		pendentes,
		ausentes,
		extras,
		divergencias,
		completedAt: status === "concluido" ? (current.completedAt || new Date().toISOString()) : current.completedAt || "",
		updatedAt: new Date().toISOString(),
		updatedBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${INVENTORIES_COLLECTION}/${documentId}`,
		collectionPath: INVENTORIES_COLLECTION,
		documentId,
		data,
	});
	await syncInventoryHistoryToAssets(data, currentUser);
	return data;
}

async function syncInventoryHistoryToAssets(inventory = {}, currentUser = {}) {
	const checkedItems = (Array.isArray(inventory.itens) ? inventory.itens : []).filter((item) =>
		item.assetId && normalizeStatus(item.status) !== "pendente",
	);
	if (!checkedItems.length) return;
	const assets = await listAssets();
	const now = new Date().toISOString();
	await Promise.all(checkedItems.map(async (item) => {
		const asset = assets.find((current) => current.id === item.assetId);
		if (!asset) return;
		const history = Array.isArray(asset.inventoryHistory) ? asset.inventoryHistory : [];
		const historyId = `${inventory.id}:${item.assetId}:${item.conferidoEm || now}`;
		if (history.some((entry) => entry.id === historyId)) return;
		const entry = {
			id: historyId,
			inventoryId: inventory.id,
			inventoryCode: inventory.codigo || "",
			inventoryName: inventory.nome || inventory.codigo || "Inventário",
			resultado: item.status,
			local: item.imovel || inventory.imovel || "",
			ambiente: item.ambiente || inventory.ambiente || "",
			usuario: item.conferidoPor || currentUser?.email || currentUser?.uid || "",
			observacao: item.observacao || "",
			createdAt: item.conferidoEm || now,
		};
		const nextAsset = {
			...asset,
			lastInventoryAt: entry.createdAt,
			inventoryStatus: normalizeStatus(item.status) === "encontrado" ? "em_dia" : "divergente",
			inventoryHistory: [entry, ...history].slice(0, 100),
			updatedAt: now,
			updatedBy: currentUser?.email || currentUser?.uid || "",
		};
		await documents.upsertDocument({
			path: `${ASSETS_COLLECTION}/${asset.id}`,
			collectionPath: ASSETS_COLLECTION,
			documentId: asset.id,
			data: nextAsset,
		});
	}));
}

async function createMovement(payload = {}, currentUser = {}) {
	const assets = await listAssets();
	const asset = assets.find((item) => item.id === payload.assetId);
	if (!asset) {
		const error = new Error("Ativo patrimonial não encontrado.");
		error.status = 404;
		throw error;
	}
	const imovelInfo = await resolveImovel({
		imovelId: payload.destinoImovelId || payload.imovelId,
		imovel: payload.destinoImovel || payload.imovel,
	});
	const documentId = createDocumentId("movement");
	const now = new Date().toISOString();
	const data = {
		id: documentId,
		assetId: asset.id,
		assetCodigo: asset.codigo,
		assetDescricao: asset.descricao,
		tipo: String(payload.tipo || "transferencia").trim(),
		origemImovelId: asset.imovelId || "",
		origemImovel: asset.imovel || "",
		origemAmbiente: asset.ambiente || "",
		destinoImovelId: imovelInfo.imovelId,
		destinoImovel: imovelInfo.imovel,
		destinoAmbiente: String(payload.destinoAmbiente || "").trim(),
		responsavelSaida: String(payload.responsavelSaida || currentUser?.displayName || currentUser?.email || "").trim(),
		responsavelRecebimento: String(payload.responsavelRecebimento || "").trim(),
		motivo: String(payload.motivo || "").trim(),
		observacao: String(payload.observacao || "").trim(),
		status: "registrada",
		createdAt: now,
		createdBy: currentUser?.email || currentUser?.uid || "",
	};
	await documents.upsertDocument({
		path: `${MOVEMENTS_COLLECTION}/${documentId}`,
		collectionPath: MOVEMENTS_COLLECTION,
		documentId,
		data,
	});
	await upsertAsset(
		{
			...asset,
			id: asset.id,
			imovelId: imovelInfo.imovelId,
			imovel: imovelInfo.imovel,
			ambiente: data.destinoAmbiente,
			responsavel: data.responsavelRecebimento || asset.responsavel,
		},
		currentUser,
	);
	return data;
}

function createFacilitiesRouter({
	requireAuthenticated,
	requireAnyPermission,
	adminRoles = [],
} = {}) {
	const router = express.Router();
	router.use(requireAuthenticated);
	router.use(requireAnyPermission(FACILITIES_PERMISSIONS, adminRoles));

	router.get("/modules", (_req, res) => {
		res.json({ ok: true, modules: MODULES });
	});

	router.get("/dashboard", async (req, res, next) => {
		try {
			res.json(await buildFacilitiesDashboard({ user: req.user }));
		} catch (error) {
			next(error);
		}
	});

	const canCreatePatrimony = requireAnyPermission(
		["facilities.patrimonio.create", "facilities.manage"],
		adminRoles,
	);
	const canEditPatrimony = requireAnyPermission(
		["facilities.patrimonio.edit", "facilities.manage"],
		adminRoles,
	);
	const canDeactivatePatrimony = requireAnyPermission(
		["facilities.patrimonio.deactivate", "facilities.manage"],
		adminRoles,
	);
	const canExecuteInventory = requireAnyPermission(
		["facilities.inventario.execute", "facilities.manage"],
		adminRoles,
	);
	const canCreateSafety = requireAnyPermission(
		["facilities.seguranca.create", "facilities.manage"],
		adminRoles,
	);
	const canEditSafety = requireAnyPermission(
		["facilities.seguranca.edit", "facilities.manage"],
		adminRoles,
	);
	const canInspectSafety = requireAnyPermission(
		["facilities.seguranca.inspect", "facilities.manage"],
		adminRoles,
	);
	const canManageOperation = requireAnyPermission(
		["facilities.operacao_predial.manage", "facilities.manage"],
		adminRoles,
	);
	const canManageSuppliers = requireAnyPermission(
		["facilities.fornecedores.manage", "facilities.manage"],
		adminRoles,
	);
	const canManageContracts = requireAnyPermission(
		["facilities.contratos.manage", "facilities.manage"],
		adminRoles,
	);
	const canCreateConsumption = requireAnyPermission(
		["facilities.consumos.create", "facilities.encargos.create", "facilities.manage"],
		adminRoles,
	);
	const canImportConsumption = requireAnyPermission(
		["facilities.consumos.import", "facilities.manage"],
		adminRoles,
	);

	router.get("/patrimonio/assets", async (_req, res, next) => {
		try {
			res.json({ ok: true, assets: await listAssets() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/patrimonio/config", async (_req, res, next) => {
		try {
			res.json({ ok: true, config: await getPatrimonyConfig() });
		} catch (error) {
			next(error);
		}
	});

	router.put("/patrimonio/config", canEditPatrimony, async (req, res, next) => {
		try {
			const config = await savePatrimonyConfig(req.body || {}, req.user);
			res.json({ ok: true, config });
		} catch (error) {
			next(error);
		}
	});

	router.post("/patrimonio/assets", canCreatePatrimony, async (req, res, next) => {
		try {
			const asset = await upsertAsset(req.body || {}, req.user);
			res.status(201).json({ ok: true, asset });
		} catch (error) {
			next(error);
		}
	});

	router.put("/patrimonio/assets/:id", canEditPatrimony, async (req, res, next) => {
		try {
			const asset = await upsertAsset({ ...(req.body || {}), id: req.params.id }, req.user);
			res.json({ ok: true, asset });
		} catch (error) {
			next(error);
		}
	});

	router.delete("/patrimonio/assets/:id", canDeactivatePatrimony, async (req, res, next) => {
		try {
			const asset = await deleteAsset(req.params.id, req.user);
			res.json({ ok: true, asset });
		} catch (error) {
			next(error);
		}
	});

	async function handleListInventories(_req, res, next) {
		try {
			res.json({ ok: true, inventories: await listInventories() });
		} catch (error) {
			next(error);
		}
	}

	async function handleCreateInventory(req, res, next) {
		try {
			const inventory = await createInventory(req.body || {}, req.user);
			res.status(201).json({ ok: true, inventory });
		} catch (error) {
			next(error);
		}
	}

	async function handleUpdateInventory(req, res, next) {
		try {
			const inventory = await updateInventory(req.params.id, req.body || {}, req.user);
			res.json({ ok: true, inventory });
		} catch (error) {
			next(error);
		}
	}

	router.get("/inventories", handleListInventories);
	router.post("/inventories", canExecuteInventory, handleCreateInventory);
	router.put("/inventories/:id", canExecuteInventory, handleUpdateInventory);
	router.get("/patrimonio/inventories", handleListInventories);
	router.post("/patrimonio/inventories", canExecuteInventory, handleCreateInventory);
	router.put("/patrimonio/inventories/:id", canExecuteInventory, handleUpdateInventory);

	router.get("/patrimonio/movements", async (_req, res, next) => {
		try {
			res.json({ ok: true, movements: await listMovements() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/patrimonio/movements", canEditPatrimony, async (req, res, next) => {
		try {
			const movement = await createMovement(req.body || {}, req.user);
			res.status(201).json({ ok: true, movement });
		} catch (error) {
			next(error);
		}
	});

	router.get("/seguranca/items", async (_req, res, next) => {
		try {
			res.json({ ok: true, items: await listSafetyItems() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/seguranca/properties/search", async (req, res, next) => {
		try {
			res.json({ ok: true, items: await searchSafetyProperties(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/seguranca/items", canCreateSafety, async (req, res, next) => {
		try {
			const item = await upsertSafetyItem(req.body || {}, req.user);
			res.status(201).json({ ok: true, item });
		} catch (error) {
			next(error);
		}
	});

	router.put("/seguranca/items/:id", canEditSafety, async (req, res, next) => {
		try {
			const item = await upsertSafetyItem({ ...(req.body || {}), id: req.params.id }, req.user);
			res.json({ ok: true, item });
		} catch (error) {
			next(error);
		}
	});

	router.get("/seguranca/inspections", async (_req, res, next) => {
		try {
			res.json({ ok: true, inspections: await listSafetyInspections() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/seguranca/inspections", canInspectSafety, async (req, res, next) => {
		try {
			const inspection = await createSafetyInspection(req.body || {}, req.user);
			res.status(201).json({ ok: true, inspection });
		} catch (error) {
			next(error);
		}
	});

	router.get("/seguranca/documents", async (_req, res, next) => {
		try {
			res.json({ ok: true, documents: await listSafetyDocuments() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/seguranca/documents", canEditSafety, async (req, res, next) => {
		try {
			const document = await createSafetyDocument(req.body || {}, req.user);
			res.status(201).json({ ok: true, document });
		} catch (error) {
			next(error);
		}
	});

	router.get("/seguranca/nonconformities", async (_req, res, next) => {
		try {
			res.json({ ok: true, nonconformities: await listSafetyNonconformities() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/seguranca/nonconformities", canEditSafety, async (req, res, next) => {
		try {
			const nonconformity = await createSafetyNonconformity(req.body || {}, req.user);
			res.status(201).json({ ok: true, nonconformity });
		} catch (error) {
			next(error);
		}
	});

	const canViewKeys = requireAnyPermission(
		["facilities.chaves.view", "facilities.acessos_chaves.view"],
		adminRoles,
	);
	const canCreateKeys = requireAnyPermission(
		["facilities.chaves.create", "facilities.manage"],
		adminRoles,
	);
	const canEditKeys = requireAnyPermission(
		["facilities.chaves.edit", "facilities.manage"],
		adminRoles,
	);
	const canCheckoutKeys = requireAnyPermission(
		["facilities.chaves.checkout", "facilities.manage"],
		adminRoles,
	);
	const canReturnKeys = requireAnyPermission(
		["facilities.chaves.return", "facilities.manage"],
		adminRoles,
	);
	const canDeclareLostKeys = requireAnyPermission(
		["facilities.chaves.declare_lost", "facilities.manage"],
		adminRoles,
	);
	const canDeactivateKeys = requireAnyPermission(
		["facilities.chaves.deactivate", "facilities.manage"],
		adminRoles,
	);
	const canGenerateKeyQr = requireAnyPermission(
		["facilities.chaves.qr.generate", "facilities.manage"],
		adminRoles,
	);

	router.get("/acessos-chaves/dashboard", canViewKeys, async (_req, res, next) => {
		try {
			res.json({ ok: true, dashboard: await facilitiesKeys.getKeysDashboard(), source: "facilities_keys" });
		} catch (error) {
			next(error);
		}
	});

	router.get("/acessos-chaves/keys", canViewKeys, async (req, res, next) => {
		try {
			const result = await facilitiesKeys.listKeys(req.query || {});
			res.json({
				ok: true,
				keys: result.items,
				items: result.items,
				pagination: result.pagination,
				source: "facilities_keys",
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos-chaves/keys", canCreateKeys, async (req, res, next) => {
		try {
			const key = await facilitiesKeys.createKey(req.body || {}, req.user);
			res.status(201).json({ ok: true, key });
		} catch (error) {
			next(error);
		}
	});

	router.put("/acessos-chaves/keys/:id", canEditKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.updateKey(req.params.id, req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos-chaves/keys/:id/checkout", canCheckoutKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.checkoutKey(req.params.id, req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos-chaves/keys/:id/return", canReturnKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.returnKey(req.params.id, req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos-chaves/keys/:id/lost", canDeclareLostKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.declareLostKey(req.params.id, req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.delete("/acessos-chaves/keys/:id", canDeactivateKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.deactivateKey(req.params.id, req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos-chaves/keys/:id/regenerate-qr", canGenerateKeyQr, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				key: await facilitiesKeys.regenerateQr(req.params.id, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/acessos-chaves/keys/:id/history", canViewKeys, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				history: await facilitiesKeys.listKeyHistory(req.params.id),
				source: "facilities_key_events",
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/acessos-chaves/migration-report", canViewKeys, async (_req, res, next) => {
		try {
			res.json({ ok: true, report: await facilitiesKeys.getMigrationReport() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/checklists", async (_req, res, next) => {
		try {
			res.json({ ok: true, checklists: await listOperationChecklists() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/checklists", canManageOperation, async (req, res, next) => {
		try {
			const checklist = await createOperationChecklist(req.body || {}, req.user);
			res.status(201).json({ ok: true, checklist });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/checklist-runs", async (_req, res, next) => {
		try {
			res.json({ ok: true, runs: await listOperationChecklistRuns() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/checklist-runs", canManageOperation, async (req, res, next) => {
		try {
			const run = await createOperationChecklistRun(req.body || {}, req.user);
			res.status(201).json({ ok: true, run });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/routines", async (_req, res, next) => {
		try {
			res.json({ ok: true, routines: await listOperationRoutines() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/routines", canManageOperation, async (req, res, next) => {
		try {
			const routine = await createOperationRoutine(req.body || {}, req.user);
			res.status(201).json({ ok: true, routine });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/maintenance", async (_req, res, next) => {
		try {
			res.json({ ok: true, maintenance: await listOperationMaintenance() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/maintenance", canManageOperation, async (req, res, next) => {
		try {
			const maintenance = await createOperationMaintenance(req.body || {}, req.user);
			res.status(201).json({ ok: true, maintenance });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/incidents", async (_req, res, next) => {
		try {
			res.json({ ok: true, incidents: await listOperationIncidents() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/incidents", canManageOperation, async (req, res, next) => {
		try {
			const incident = await createOperationIncident(req.body || {}, req.user);
			res.status(201).json({ ok: true, incident });
		} catch (error) {
			next(error);
		}
	});

	router.get("/operacao-predial/lost-found", async (_req, res, next) => {
		try {
			res.json({ ok: true, items: await listLostFound() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/operacao-predial/lost-found", canManageOperation, async (req, res, next) => {
		try {
			const item = await createLostFound(req.body || {}, req.user);
			res.status(201).json({ ok: true, item });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/suppliers", async (_req, res, next) => {
		try {
			res.json({ ok: true, suppliers: await listSuppliers() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/suppliers/search", async (req, res, next) => {
		try {
			res.json({ ok: true, suppliers: await searchSuppliers(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/properties/search", async (req, res, next) => {
		try {
			res.json({ ok: true, items: await searchSafetyProperties(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/suppliers", canManageSuppliers, async (req, res, next) => {
		try {
			const supplier = await upsertSupplier(req.body || {}, req.user);
			res.status(201).json({ ok: true, supplier });
		} catch (error) {
			next(error);
		}
	});

	router.put("/fornecedores-contratos/suppliers/:id", canManageSuppliers, async (req, res, next) => {
		try {
			const supplier = await upsertSupplier({ ...(req.body || {}), id: req.params.id }, req.user);
			res.json({ ok: true, supplier });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/contracts", async (_req, res, next) => {
		try {
			res.json({ ok: true, contracts: await listFacilitiesContracts() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/contracts", canManageContracts, async (req, res, next) => {
		try {
			const contract = await upsertFacilitiesContract(req.body || {}, req.user);
			res.status(201).json({ ok: true, contract });
		} catch (error) {
			next(error);
		}
	});

	router.put("/fornecedores-contratos/contracts/:id", canManageContracts, async (req, res, next) => {
		try {
			const contract = await upsertFacilitiesContract({ ...(req.body || {}), id: req.params.id }, req.user);
			res.json({ ok: true, contract });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/documents", async (_req, res, next) => {
		try {
			res.json({ ok: true, documents: await listContractDocuments() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/documents", canManageContracts, async (req, res, next) => {
		try {
			const document = await createContractDocument(req.body || {}, req.user);
			res.status(201).json({ ok: true, document });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/adjustments", async (_req, res, next) => {
		try {
			res.json({ ok: true, adjustments: await listContractAdjustments() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/adjustments", canManageContracts, async (req, res, next) => {
		try {
			const adjustment = await createContractAdjustment(req.body || {}, req.user);
			res.status(201).json({ ok: true, adjustment });
		} catch (error) {
			next(error);
		}
	});

	router.get("/fornecedores-contratos/evaluations", async (_req, res, next) => {
		try {
			res.json({ ok: true, evaluations: await listSupplierEvaluations() });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/evaluations", canManageSuppliers, async (req, res, next) => {
		try {
			const evaluation = await createSupplierEvaluation(req.body || {}, req.user);
			res.status(201).json({ ok: true, evaluation });
		} catch (error) {
			next(error);
		}
	});

	router.post("/fornecedores-contratos/evaluation-links", canManageSuppliers, async (req, res, next) => {
		try {
			const link = await createSupplierEvaluationLink(req.body || {}, req.user);
			res.status(201).json({ ok: true, link });
		} catch (error) {
			next(error);
		}
	});

	router.get("/consumos/properties/search", async (req, res, next) => {
		try {
			res.json({ ok: true, items: await searchSafetyProperties(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.get("/consumos/items", async (req, res, next) => {
		try {
			res.json({ ok: true, consumptions: await listConsumptions(req.query || {}) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/consumos/items", canCreateConsumption, async (req, res, next) => {
		try {
			const consumption = await createConsumption(req.body || {}, req.user);
			res.status(201).json({ ok: true, consumption });
		} catch (error) {
			next(error);
		}
	});

	router.post("/consumos/import/preview", canImportConsumption, async (req, res, next) => {
		try {
			const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
			res.json({
				ok: true,
				preview: rows.slice(0, 50).map((row, index) => ({
					index: index + 1,
					row,
					status: row?.imovelId && row?.tipo && row?.competencia ? "valido" : "pendente",
					warnings: [
						!row?.imovelId ? "Imóvel ausente" : "",
						!row?.tipo ? "Tipo ausente" : "",
						!row?.competencia ? "Competência ausente" : "",
					].filter(Boolean),
				})),
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/relatorios/consolidado", async (req, res, next) => {
		try {
			res.json(await buildFacilitiesReport({ user: req.user }));
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = {
	buildFacilitiesDashboard,
	createFacilitiesRouter,
	getPublicQrRecord,
	getPublicSupplierEvaluation,
	runSupplierEvaluationEmailRoutine,
	submitPublicSupplierEvaluation,
};
