import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import {
	AlertTriangle,
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	Copy,
	Download,
	Eye,
	FileText,
	Landmark,
	Loader2,
	Mail,
	Pencil,
	Plus,
	RefreshCw,
	Repeat2,
	Search,
	Settings,
	TableProperties,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import ModalShell from "../../../components/ui/ModalShell";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import { addClusterLogo } from "../../../utils/pdfBranding";
import BudgetApprovalsView from "./budget/BudgetApprovalsView";
import BudgetCostCentersView from "./budget/BudgetCostCentersView";
import BudgetDashboardView from "./budget/BudgetDashboardView";
import BudgetDreView from "./budget/BudgetDreView";
import CompaniesBranchesConfigSection from "./budget/config/CompaniesBranchesConfigSection";
import CostCentersTreeConfigSection from "./budget/config/CostCentersTreeConfigSection";
import FinancialAccountsConfigSection, {
	FinancialAccountCategoriesModal,
} from "./budget/config/FinancialAccountsConfigSection";
import BudgetMatrixConfigSection from "./budget/config/BudgetMatrixConfigSection";
import BudgetParametersSection from "./budget/config/BudgetParametersSection";
import PartnersConfigSection from "./budget/config/PartnersConfigSection";
import CostCenterMovementsTab from "./budget/costcenter/CostCenterMovementsTab";
import CostCenterRegistrationTab from "./budget/costcenter/CostCenterRegistrationTab";
import { getBudgetDashboardDetailRenderer } from "./budget/details";
import FinanceiroEquipePage from "./equipe/FinanceiroEquipePage";
import FinancialKpiCard from "./kpi/FinancialKpiCard";
import TariffsDetailLayout from "./tariffs/TariffsDetailLayout";
import TariffsDetectedBlocks from "./tariffs/TariffsDetectedBlocks";
import TariffsOverviewCharts from "./tariffs/TariffsOverviewCharts";
import TariffsOverviewKpis from "./tariffs/TariffsOverviewKpis";
import TariffsPeriodSelector from "./tariffs/TariffsPeriodSelector";
import TariffsUploadActions from "./tariffs/TariffsUploadActions";
import { useBudgetConfig } from "../hooks/useBudgetConfig";
import { useBudgetOperationalActions } from "../hooks/useBudgetOperationalActions";
import { useCostCenterForm } from "../hooks/useCostCenterForm";
import { useTariffsReport } from "../hooks/useTariffsReport";
import {
	buildBudgetOperationalKpis,
	buildCostCenterTopCards,
	buildDirectorateRows,
	buildOperationalCenterGroups,
	findBudgetParetoRows,
	getBudgetInsights as getBudgetInsightsFromStatement,
	getTariffsAvailableYears as getTariffsDetailAvailableYears,
	TARIFFS_DETAIL_BUILDERS,
	paginateBudgetGroups,
} from "../domain/financialStatement";
import {
	BUDGET_CATEGORY_CLASSES,
	BUDGET_CATEGORY_CLASS_LABELS,
	FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
	enrichFinancialAccountWithCategory,
	getFinancialAccountCategoryCatalog,
	normalizeFinancialAccountCategories,
} from "../utils/budgetAccountCategories";
import {
	buscarCentrosCustoOrcamentoFinanceiro,
	buscarConfigPlanilhasFinanceiro,
	buscarDadosOrcamentoFinanceiro,
	buscarDashboardFinanceiro,
	buscarLogsPlanilhasFinanceiro,
	buscarSerasaReportFinanceiro,
	buscarTarifasReportFinanceiro,
	buscarImportacaoDadosOrcamentoFinanceiro,
	iniciarImportacaoDadosOrcamentoFinanceiro,
	limparDadosOrcamentoFinanceiro,
	limparSerasaReportFinanceiro,
	salvarCentrosCustoOrcamentoFinanceiro,
	salvarConfigPlanilhasFinanceiro,
	salvarSerasaReportFinanceiro,
	sincronizarPlanilhasFinanceiro,
	testarPlanilhaFinanceiro,
} from "../services/financeiroService";
import {
	buildBudgetAccountChart,
	buildBudgetCenterChart,
	buildBudgetForecastChart,
	buildBudgetFullSupplierChart,
	buildBudgetMonthlyChart,
	buildBudgetSupplierChart,
} from "../utils/budgetCharts";
import {
	removeAccount as removeBudgetAccount,
	removeBranch as removeBudgetBranch,
	removeCenter as removeBudgetCenter,
	removeCompany as removeBudgetCompany,
	removePartner as removeBudgetPartner,
	upsertAccount as upsertBudgetAccount,
	upsertCenter as upsertBudgetCenter,
	upsertCompanyOrBranch as upsertBudgetCompanyOrBranch,
	upsertPartner as upsertBudgetPartner,
} from "../utils/budgetConfigActions";
import {
	buildCostCenterMovementsByMonth,
	getSelectedCostCenterMovementMonth,
} from "../utils/costCenterMovements";
import {
	brl,
	decimal,
	formatBudgetCurrency,
	formatValue,
	integer,
} from "../utils/financeiroFormatters";
import { splitPdfTextToTwoLines } from "../utils/financeiroPdfText";
import {
	getBudgetMonthSelectorYear,
	getBudgetReference,
	getFinanceiroPageFlags,
} from "../utils/financeiroPageViewModel";

const FINANCE_FONT_STACK =
	"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const centerTextPlugin = {
	id: "centerText",
	afterDraw(chart, _args, options = {}) {
		if (!options.title && !options.value) return;
		const arc = chart.getDatasetMeta(0)?.data?.[0];
		if (!arc) return;
		const { ctx } = chart;
		const x = arc.x;
		const y = arc.y;
		const fitText = (text, maxWidth, baseSize, minSize) => {
			let size = baseSize;
			ctx.font = `900 ${size}px ${FINANCE_FONT_STACK}`;
			while (ctx.measureText(text).width > maxWidth && size > minSize) {
				size -= 1;
				ctx.font = `900 ${size}px ${FINANCE_FONT_STACK}`;
			}
			return size;
		};
		ctx.save();
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = options.titleColor || "#64748b";
		ctx.font = `900 11px ${FINANCE_FONT_STACK}`;
		ctx.fillText(options.title || "", x, y - 9);
		ctx.fillStyle = options.valueColor || "#0f172a";
		fitText(String(options.value || ""), options.maxWidth || 118, 17, 11);
		ctx.fillText(options.value || "", x, y + 9);
		ctx.restore();
	},
};

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	ArcElement,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
	Legend,
	centerTextPlugin,
);

ChartJS.defaults.font.family = FINANCE_FONT_STACK;
ChartJS.defaults.font.weight = "600";
ChartJS.defaults.color = "#334155";

const EMPTY_SERASA_LIST = [];

const PAGE_META = {
	dashboard: {
		title: "Painel Financeiro",
		subtitle: "Acompanhamento diário de indicadores",
	},
	contasPagar: {
		title: "Contas a Pagar",
		subtitle: "Controle de vencimentos, pagamentos e pendências.",
	},
	contasReceber: {
		title: "Contas a Receber",
		subtitle: "Recebíveis, inadimplência e saldo em aberto.",
	},
	faturamento: {
		title: "Faturamento",
		subtitle: "Receita por período, cidade, empresa e produto.",
	},
	notas: {
		title: "Notas",
		subtitle: "Acompanhamento de notas lançadas no financeiro.",
	},
	reportsSerasa: {
		title: "Reports - Serasa",
		subtitle: "Dashboard de acompanhamento das movimentações Serasa.",
	},
	reportsTarifas: {
		title: "Reports - Tarifas",
		subtitle: "Tarifas, formas de pagamento, faturas e receita por cliente.",
	},
	reportsTarifasFaturas: {
		title: "Reports - Tarifas - Faturas",
		subtitle: "Faturas agrupadas por ano e mês.",
	},
	reportsTarifasRecCliente: {
		title: "Reports - Tarifas - Receita Cliente",
		subtitle: "Receita por cliente separada por ano.",
	},
	reportsTarifasFormasPagamento: {
		title: "Reports - Tarifas - Formas de Pagamento",
		subtitle: "Formas de pagamento, cobrança e tarifas por período.",
	},
	orcamentoDashboard: {
		title: "Gestão Orçamentária",
		subtitle: "Visão executiva do orçamento, realizado, saldo e desvios.",
	},
	orcamentoDados: {
		title: "Dados Orçamentários",
		subtitle:
			"Importe XLSX, confira os campos e alimente a gestão orçamentária.",
	},
	orcamentoCentrosCusto: {
		title: "Orçamento",
		subtitle:
			"Organize categorias, contas financeiras, centros de custo e limites orçamentários.",
	},
	orcamentoDre: {
		title: "DRE",
		subtitle: "Demonstração de Resultado do Exercício por competência.",
	},
	orcamentoAprovacoes: {
		title: "Aprovações de Orçamento",
		subtitle: "Fluxo de solicitações, aprovações e bloqueios.",
	},
	orcamentoConfiguracoes: {
		title: "Configurações de Orçamento",
		subtitle: "Parâmetros, categorias e regras do módulo orçamentário.",
	},
	configuracoes: {
		title: "Configurações Financeiras",
		subtitle: "Metas, categorias, alertas e dados demonstrativos.",
	},
	equipe: {
		title: "Equipe",
		subtitle: "Organograma, cargos e atribuições do time financeiro.",
	},
};

const BUDGET_OPERATIONAL_PAGE_VIEWS = {
	orcamentoAprovacoes: BudgetApprovalsView,
	orcamentoCentrosCusto: BudgetCostCentersView,
	orcamentoDre: BudgetDreView,
};

const BUDGET_IMPORT_FIELDS = [
	{ key: "quebra", label: "Quebra" },
	{ key: "data", label: "Data" },
	{ key: "fornecedor", label: "Fornecedor" },
	{ key: "codConta", label: "Cod_Conta" },
	{ key: "nomeConta", label: "Nome_Conta" },
	{ key: "codCc", label: "Cod_CC" },
	{ key: "nomeCc", label: "Nome_CC" },
	{ key: "orcado", label: "Orçado" },
	{ key: "realizado", label: "Realizado" },
	{ key: "empresa", label: "Empresa" },
	{ key: "filial", label: "Filial" },
	{ key: "conta", label: "Conta" },
	{ key: "seqMov", label: "SeqMov" },
	{ key: "titulo", label: "Titulo" },
	{ key: "tipo", label: "Tipo" },
	{ key: "observacoes", label: "Observações" },
	{ key: "ano", label: "Ano" },
	{ key: "numMes", label: "Num_Mes" },
	{ key: "mes", label: "Mês" },
	{ key: "categoria", label: "Categoria" },
	{ key: "gestor", label: "Gestor" },
	{ key: "quebra2", label: "Quebra2" },
	{ key: "entidade", label: "Entidade" },
	{ key: "diretoria", label: "Diretoria" },
	{ key: "diretor", label: "Diretor" },
	{ key: "statusProjetos", label: "Status_Projetos" },
	{ key: "grupo", label: "Grupo" },
];

function normalizeImportHeader(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "");
}

function formatSpreadsheetValue(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toLocaleDateString("pt-BR");
	}
	return value ?? "";
}

function budgetMonthName(month) {
	return (
		[
			"",
			"Janeiro",
			"Fevereiro",
			"Marco",
			"Abril",
			"Maio",
			"Junho",
			"Julho",
			"Agosto",
			"Setembro",
			"Outubro",
			"Novembro",
			"Dezembro",
		][Number(month) || 0] || ""
	);
}

const DEFAULT_SHEETS_CONFIG = {
	enabled: false,
	intervalMinutes: 30,
	serviceAccountConfigured: false,
	serviceAccountEmail: "",
	serviceAccountProjectId: "",
	serviceAccountError: "",
	lastRunAt: "",
	lastRunStatus: "",
	lastRunMessage: "",
	nextRunAt: "",
	sources: [
		{
			id: "contas_pagar",
			label: "Contas a pagar",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "contas_receber",
			label: "Contas a receber",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "faturamento",
			label: "Faturamento",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "notas",
			label: "Notas",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "serasa",
			label: "Serasa",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "MOVIMENTAÇÃO SERASA",
			range: "A:ZZ",
			headerRow: 1,
			intervalMinutes: 60,
		},
		{
			id: "tarifas",
			label: "Tarifas",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
			intervalMinutes: 60,
		},
	],
};

function normalizeSerasaUploadRows(rows = []) {
	return rows
		.map((row) => {
			const normalized = {};
			Object.entries(row || {}).forEach(([key, value]) => {
				normalized[key] = formatSpreadsheetValue(value);
			});
			if (!normalized.Data && normalized["Coluna 1"]) {
				normalized.Data = normalized["Coluna 1"];
			}
			return normalized;
		})
		.filter((row) =>
			Object.values(row).some((value) => String(value ?? "").trim()),
		);
}

function extractWorksheetNumberCell(worksheet, address) {
	const value = worksheet?.[address]?.v ?? worksheet?.[address]?.w ?? "";
	const number = Number(String(value).replace(/[^\d.-]/g, ""));
	return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function isSerasaClientMarker(row = {}) {
	const text = [row.type, row.description, row.operation]
		.join(" ")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	return /\b(clientes?|usuarios?|usuarias?|base\s+serasa|qtd\s+clientes?)\b/.test(text);
}

function serasaMovementKey(row = {}) {
	const value = Math.round(Math.abs(Number(row.value || 0)) * 100);
	return [
		row.date || "",
		String(row.type || "").trim().toLowerCase(),
		String(row.description || "").trim().toLowerCase(),
		String(row.operation || "").trim().toLowerCase(),
		value,
	].join("|");
}

function dedupeSerasaRows(rows = []) {
	return [...new Map(rows.map((row) => [serasaMovementKey(row), row])).values()];
}

const SERASA_KPI_CONFIG = [
	{
		id: "receitaLiquida",
		title: "Receita líquida",
		icon: "BadgeDollarSign",
		color: "emerald",
	},
	{
		id: "totalEntradas",
		title: "Entradas",
		icon: "CircleDollarSign",
		color: "blue",
	},
	{
		id: "totalSaidas",
		title: "Saídas",
		icon: "Wallet",
		color: "red",
	},
	{
		id: "comissao",
		title: "Comissão",
		icon: "ReceiptText",
		color: "amber",
	},
	{
		id: "ticketMedio",
		title: "Ticket médio",
		icon: "Landmark",
		color: "violet",
	},
	{
		id: "clientes",
		title: "Clientes na base",
		icon: "Users",
		color: "slate",
		type: "number",
	},
];

function isSerasaNetRevenue(row = {}) {
	return (
		row.isNetRevenue ||
		row.direction === "receita_liquida" ||
		String(row.operation || "").trim().toLowerCase() === "receita líquida" ||
		String(row.operation || "").trim() === "-"
	);
}

function normalizeSerasaOperationLabel(value, fallback = "Movimentação") {
	const text = String(value || fallback).trim();
	if (!text) return fallback;
	const normalized = text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (normalized === "entrada" || normalized === "credito") return "Entrada";
	if (normalized === "saida" || normalized === "debito") return "Saída";
	if (normalized === "estorno") return "Estorno";
	if (normalized === "receita liquida") return "Receita líquida";
	return text;
}

function getSerasaRowDate(row = {}) {
	const date = dateFromInput(row.date);
	return date || null;
}

function serasaRowMatchesPeriod(row = {}, selectedPeriod = {}) {
	const date = getSerasaRowDate(row);
	if (!date) return false;
	if (selectedPeriod.mode === "custom") {
		const start = dateFromInput(selectedPeriod.startDate);
		const end = dateFromInput(selectedPeriod.endDate);
		if (!start || !end) return true;
		return date >= start && date <= end;
	}
	const year = Number(row.year || date.getFullYear());
	const month = Number(row.month || date.getMonth() + 1);
	if (selectedPeriod.mode === "year") {
		return year === Number(selectedPeriod.referenceYear);
	}
	return (
		year === Number(selectedPeriod.referenceYear) &&
		month === Number(selectedPeriod.referenceMonth)
	);
}

function serasaClientHistoryMatchesPeriod(item = {}, selectedPeriod = {}) {
	const year = Number(item.year || 0);
	const month = Number(item.month || 0);
	if (!year || !month) return false;
	if (selectedPeriod.mode === "year") {
		return year === Number(selectedPeriod.referenceYear);
	}
	if (selectedPeriod.mode === "custom") {
		const date = dateFromInput(`${year}-${String(month).padStart(2, "0")}-01`);
		const start = dateFromInput(selectedPeriod.startDate);
		const end = dateFromInput(selectedPeriod.endDate);
		if (!date || !start || !end) return false;
		return date >= start && date <= end;
	}
	return (
		year === Number(selectedPeriod.referenceYear) &&
		month === Number(selectedPeriod.referenceMonth)
	);
}

function resolveSerasaClients(clientesHistory = [], selectedPeriod = {}) {
	return [...(clientesHistory || [])]
		.filter((item) => serasaClientHistoryMatchesPeriod(item, selectedPeriod))
		.sort((a, b) => String(b.key || "").localeCompare(String(a.key || "")))[0]?.clientes || 0;
}

function summarizeSerasaRows(rows = [], clientesHistory = [], selectedPeriod = {}) {
	const uniqueRows = dedupeSerasaRows(
		rows.filter((row) => !isSerasaClientMarker(row)),
	);
	const monthly = new Map();
	const operationTotals = new Map();
	const summary = uniqueRows.reduce(
		(acc, row) => {
			const value = Number(row.value || 0);
			const absoluteValue = Math.abs(value);
			const netRevenue = isSerasaNetRevenue(row);
			const date = getSerasaRowDate(row);
			const year = Number(row.year || date?.getFullYear() || 0);
			const month = Number(row.month || (date ? date.getMonth() + 1 : 0));
			const monthLabel =
				year && month ? `${year} - ${budgetMonthName(month)}` : "Sem mês";
			const monthKey = year && month ? `${year}-${String(month).padStart(2, "0")}` : "sem-mes";
			const currentMonth = monthly.get(monthKey) || {
				key: monthKey,
				label: monthLabel,
				entradas: 0,
				saidas: 0,
				receitaLiquida: 0,
				total: 0,
			};

			if (netRevenue) {
				acc.receitaLiquida += absoluteValue;
				currentMonth.receitaLiquida += absoluteValue;
				operationTotals.set(
					"Receita líquida",
					(operationTotals.get("Receita líquida") || 0) + absoluteValue,
				);
			} else if (value < 0 || row.direction === "saida") {
				acc.totalSaidas += absoluteValue;
				currentMonth.saidas += absoluteValue;
				const label = normalizeSerasaOperationLabel(
					row.operation || row.type,
					"Saída",
				);
				operationTotals.set(label, (operationTotals.get(label) || 0) + absoluteValue);
			} else if (value > 0 || row.direction === "entrada") {
				acc.totalEntradas += absoluteValue;
				currentMonth.entradas += absoluteValue;
				const label = normalizeSerasaOperationLabel(
					row.operation || row.type,
					"Entrada",
				);
				operationTotals.set(label, (operationTotals.get(label) || 0) + absoluteValue);
			}

			currentMonth.total += 1;
			monthly.set(monthKey, currentMonth);
			return acc;
		},
		{
			totalRows: uniqueRows.length,
			totalEntradas: 0,
			totalSaidas: 0,
			receitaLiquida: 0,
			comissao: 0,
			ticketMedio: 0,
			clientes: resolveSerasaClients(clientesHistory, selectedPeriod),
		},
	);
	const entryRows = uniqueRows.filter(
		(row) => Number(row.value || 0) > 0 && !isSerasaNetRevenue(row),
	);
	summary.comissao = summary.totalSaidas;
	summary.ticketMedio = entryRows.length ? summary.totalEntradas / entryRows.length : 0;
	return {
		summary,
		monthly: [...monthly.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
		operationTotals: [...operationTotals.entries()]
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6),
	};
}

function formatSerasaPeriodLabel(selectedPeriod = {}) {
	if (selectedPeriod.mode === "year") {
		return `Ano ${selectedPeriod.referenceYear}`;
	}
	if (selectedPeriod.mode === "custom") {
		return "Datas selecionadas";
	}
	return `Mês ${budgetMonthName(selectedPeriod.referenceMonth)}`;
}

function formatTariffFee(item = {}) {
	const label = String(item.valueLabel || "").trim();
	if (label && /%/.test(label)) return label;
	const numericLabel = Number(label.replace(",", "."));
	if (label && Number.isNaN(numericLabel)) return label;
	return brl.format(Number(item.value || numericLabel || 0));
}

function formatUpdatedAt(value) {
	if (!value) return "Sem atualização";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Sem atualização";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function trendText(trend, label) {
	if (!trend) return "Sem comparativo";
	const arrow = trend.direction === "up" ? "↑" : "↓";
	return `${arrow} ${decimal.format(Number(trend.percent || 0))}% ${label || ""}`.trim();
}

const EXPORT_OPTIONS = [
	{ id: "kpis", label: "Indicadores principais" },
	{ id: "billing", label: "Últimos faturamentos" },
	{ id: "receivables", label: "Previsão x recebido" },
	{ id: "methods", label: "Formas de pagamento" },
	{ id: "evolution", label: "Evolução de recebimento" },
	{ id: "cities", label: "Top cidades" },
	{ id: "alerts", label: "Alertas financeiros" },
	{ id: "summary", label: "Resumo operacional" },
	{ id: "upcoming", label: "Contas a vencer" },
];

const BUDGET_REPORT_OPTIONS = [
	{ id: "summary", label: "KPIs: orçado, realizado, saldo e desvio" },
	{ id: "burnRate", label: "Ritmo de consumo do período" },
	{ id: "villains", label: "Vilões do orçamento" },
	{ id: "monthly", label: "Gráfico orçado x realizado mensal" },
	{ id: "forecast", label: "Gráfico de tendência e forecast" },
	{ id: "waterfall", label: "Cascata por conta financeira" },
	{ id: "accounts", label: "Ranking por conta financeira" },
	{ id: "centers", label: "Distribuição por centro de custo" },
	{ id: "suppliers", label: "Concentração por fornecedor" },
	{ id: "directorates", label: "Ranking por diretoria" },
	{ id: "movements", label: "Todas as movimentações do período" },
	{ id: "approvals", label: "Aprovações do orçamento" },
];

const SERASA_REPORT_OPTIONS = [
	{ id: "kpis", label: "Indicadores principais" },
	{ id: "monthly", label: "Evolução mensal Serasa" },
	{ id: "clients", label: "Evolução mensal Clientes Base" },
	{ id: "operations", label: "Concentração por operação" },
	{ id: "movements", label: "Movimentações do período" },
];

const TARIFFS_REPORT_OPTIONS = [
	{ id: "kpis", label: "Indicadores principais" },
	{ id: "boletoTariffs", label: "Tarifas de boletos por banco/forma de cobrança" },
	{ id: "monthlyTariffs", label: "Tarifas mensais por banco" },
	{ id: "paymentMix", label: "Formas de pagamento" },
	{ id: "billingMethods", label: "Clientes por forma de cobrança" },
	{ id: "topClients", label: "Receita por cliente" },
	{ id: "invoices", label: "Faturas por mês" },
];

function periodLabel(period) {
	if (period === "today") return "Hoje";
	if (period === "year") return "Ano";
	return "Mês";
}

function sanitizeFileName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

function buildFinanceiroRows(data, sectionId) {
	if (sectionId === "billing") {
		return (data?.lastBillings || []).map((item) => [
			item.label,
			brl.format(Number(item.value || 0)),
		]);
	}
	if (sectionId === "receivables") {
		return (data?.receivables || []).map((item) => [
			item.label,
			brl.format(Number(item.previsto || 0)),
			brl.format(Number(item.recebido || 0)),
		]);
	}
	if (sectionId === "methods") {
		const total = (data?.paymentMethods || []).reduce(
			(sum, item) => sum + Number(item.value || 0),
			0,
		);
		return (data?.paymentMethods || []).map((item) => [
			item.label,
			brl.format(Number(item.value || 0)),
			`${decimal.format(total ? (Number(item.value || 0) / total) * 100 : 0)}%`,
		]);
	}
	if (sectionId === "evolution") {
		return (data?.revenueEvolution || []).map((item) => [
			item.label,
			brl.format(Number(item.value || 0)),
		]);
	}
	if (sectionId === "cities") {
		return (data?.citiesRanking || []).map((item) => [
			item.label,
			brl.format(Number(item.value || 0)),
		]);
	}
	if (sectionId === "alerts") {
		return (data?.alerts || []).map((item) => [
			item.title,
			item.description || "-",
			item.severity || "-",
		]);
	}
	if (sectionId === "summary") {
		return [
			[
				"Notas lançadas",
				integer.format(Number(data?.operationalSummary?.notasLancadas || 0)),
			],
			[
				"Pagamentos conciliados",
				integer.format(
					Number(data?.operationalSummary?.pagamentosConciliados || 0),
				),
			],
			[
				"Valor conciliado",
				brl.format(Number(data?.operationalSummary?.valorConciliado || 0)),
			],
			[
				"Tickets resolvidos",
				integer.format(
					Number(data?.operationalSummary?.ticketsResolvidos || 0),
				),
			],
			[
				"Pendências em aberto",
				integer.format(
					Number(data?.operationalSummary?.pendenciasAbertas || 0),
				),
			],
		];
	}
	if (sectionId === "upcoming") {
		return (data?.upcomingAccounts || []).map((item) => [
			item.vencimento,
			item.nome,
			brl.format(Number(item.valor || 0)),
			String(item.dias ?? "-"),
		]);
	}
	return [];
}

async function exportFinanceiroPdf(data, selectedSections, period) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 12;
	const headerHeight = 34;
	const footerHeight = 12;
	let y = 46;

	const ensureSpace = (height = 30) => {
		if (y + height <= pageHeight - 18) return;
		pdf.addPage();
		y = 18;
	};

	const drawTitle = (title) => {
		ensureSpace(18);
		pdf.setTextColor(15, 23, 42);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(12);
		pdf.text(title, margin, y);
		y += 6;
	};

	const drawMiniBars = (items, labelKey = "label", valueKey = "value") => {
		const rows = items.slice(0, 6);
		if (!rows.length) return;
		const max = Math.max(...rows.map((item) => Number(item[valueKey] || 0)), 1);
		rows.forEach((item) => {
			ensureSpace(9);
			const value = Number(item[valueKey] || 0);
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(8);
			pdf.setTextColor(51, 65, 85);
			pdf.text(String(item[labelKey] || "-").slice(0, 34), margin, y);
			pdf.setFillColor(226, 232, 240);
			pdf.roundedRect(margin + 48, y - 4, 60, 3.5, 1, 1, "F");
			pdf.setFillColor(37, 99, 235);
			pdf.roundedRect(
				margin + 48,
				y - 4,
				Math.max(3, (value / max) * 60),
				3.5,
				1,
				1,
				"F",
			);
			pdf.setTextColor(15, 23, 42);
			pdf.text(brl.format(value), margin + 112, y);
			y += 8;
		});
		y += 2;
	};

	pdf.setFillColor(5, 35, 75);
	pdf.rect(0, 0, pageWidth, 34, "F");
	pdf.setFillColor(249, 115, 22);
	pdf.rect(0, 32, pageWidth, 2, "F");
	pdf.setTextColor(255, 255, 255);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(18);
	pdf.text("Painel Financeiro", margin, 14);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	pdf.text(
		`${periodLabel(period)} · Gerado em ${new Date().toLocaleString("pt-BR")} · Atualizado em ${formatUpdatedAt(data?.updatedAt)}`,
		margin,
		24,
	);
	await addClusterLogo(pdf, { width: 24, height: 12, y: 8, marginRight: 12 });

	if (selectedSections.includes("kpis")) {
		drawTitle("Indicadores principais");
		const kpis = (data?.kpis || []).slice(0, 10);
		const cardWidth = 52;
		const cardHeight = 24;
		kpis.forEach((item, index) => {
			const col = index % 5;
			const row = Math.floor(index / 5);
			const x = margin + col * (cardWidth + 4);
			const cardY = y + row * (cardHeight + 4);
			pdf.setFillColor(248, 250, 252);
			pdf.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "F");
			pdf.setDrawColor(226, 232, 240);
			pdf.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "S");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6.8);
			pdf.setTextColor(71, 85, 105);
			pdf.text(`${index + 1}. ${item.title}`.slice(0, 38), x + 3, cardY + 6);
			pdf.setFontSize(12);
			pdf.setTextColor(15, 23, 42);
			pdf.text(formatValue(item.value, item.type), x + 3, cardY + 15);
			pdf.setFontSize(6.5);
			pdf.setTextColor(
				item.trend?.status === "negative" ? 220 : 22,
				item.trend?.status === "negative" ? 38 : 163,
				item.trend?.status === "negative" ? 38 : 74,
			);
			pdf.text(
				trendText(item.trend, item.trendLabel).slice(0, 30),
				x + 3,
				cardY + 21,
			);
		});
		y += kpis.length > 5 ? 58 : 30;
	}

	const tableConfigs = {
		billing: {
			title: "Últimos faturamentos do mês",
			head: [["Data", "Faturamento"]],
		},
		receivables: {
			title: "Previsão de contas a receber / recebidas",
			head: [["Dia", "Previsto", "Recebido"]],
		},
		methods: {
			title: "Recebimentos por forma de pagamento",
			head: [["Forma", "Valor", "Participação"]],
		},
		evolution: {
			title: "Evolução do recebimento no mês",
			head: [["Data", "Recebido acumulado"]],
		},
		cities: {
			title: "Top cidades por faturamento",
			head: [["Cidade", "Faturamento"]],
		},
		alerts: {
			title: "Alertas financeiros",
			head: [["Alerta", "Descrição", "Severidade"]],
		},
		summary: {
			title: "Resumo operacional do dia",
			head: [["Indicador", "Valor"]],
		},
		upcoming: {
			title: "Contas a vencer",
			head: [["Vencimento", "Cliente / Grupo", "Valor", "Dias"]],
		},
	};

	Object.entries(tableConfigs).forEach(([sectionId, config]) => {
		if (!selectedSections.includes(sectionId)) return;
		const body = buildFinanceiroRows(data, sectionId);
		drawTitle(config.title);
		if (["billing", "evolution", "cities"].includes(sectionId)) {
			const source =
				sectionId === "billing"
					? data?.lastBillings
					: sectionId === "evolution"
						? data?.revenueEvolution
						: data?.citiesRanking;
			drawMiniBars(source || []);
		}
		autoTable(pdf, {
			startY: y,
			head: config.head,
			body: body.length
				? body
				: [
						["Nenhum dado encontrado", "", "", ""].slice(
							0,
							config.head[0].length,
						),
					],
			theme: "grid",
			margin: {
				top: headerHeight + 8,
				bottom: footerHeight + 8,
				left: margin,
				right: margin,
			},
			styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak" },
			headStyles: { fillColor: [5, 35, 75], textColor: 255, fontStyle: "bold" },
			alternateRowStyles: { fillColor: [248, 250, 252] },
		});
		y = (pdf.lastAutoTable?.finalY || y) + 9;
	});

	const pages = pdf.internal.getNumberOfPages();
	for (let page = 1; page <= pages; page += 1) {
		pdf.setPage(page);
		pdf.setFillColor(248, 250, 252);
		pdf.rect(0, pageHeight - 12, pageWidth, 12, "F");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Sistema de Retiradas | Cluster MG", margin, pageHeight - 5);
		pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 5, {
			align: "right",
		});
	}

	pdf.save(`painel-financeiro-${sanitizeFileName(periodLabel(period))}.pdf`);
}

function ExportFinanceiroModal({ data, period, onClose }) {
	const [selected, setSelected] = useState(() =>
		EXPORT_OPTIONS.map((item) => item.id),
	);
	const [generating, setGenerating] = useState(false);

	const toggle = (id) => {
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	};

	const handleExport = async () => {
		setGenerating(true);
		try {
			await exportFinanceiroPdf(data, selected, period);
			onClose();
		} finally {
			setGenerating(false);
		}
	};

	return (
		<ModalShell
			title="Exportar visão geral"
			description="Selecione quais blocos do painel financeiro devem entrar no PDF."
			size="3xl"
			onClose={onClose}
			icon={
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
					<Download size={22} />
				</span>
			}
			footer={
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={() => setSelected(EXPORT_OPTIONS.map((item) => item.id))}
						className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Selecionar todos
					</button>
					<button
						type="button"
						onClick={handleExport}
						disabled={!selected.length || generating}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{generating ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Download size={17} />
						)}
						{generating ? "Gerando..." : "Gerar PDF"}
					</button>
				</div>
			}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				{EXPORT_OPTIONS.map((option) => (
					<label
						key={option.id}
						className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
					>
						<input
							type="checkbox"
							checked={selected.includes(option.id)}
							onChange={() => toggle(option.id)}
							className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
						/>
						{option.label}
					</label>
				))}
			</div>
		</ModalShell>
	);
}

let cachedSempreLogoDataUrl = "";

async function getSempreLogoDataUrl() {
	if (cachedSempreLogoDataUrl) return cachedSempreLogoDataUrl;
	const response = await fetch("/sempre-logo-azul.png", {
		cache: "force-cache",
	});
	if (!response.ok) return "";
	const blob = await response.blob();
	cachedSempreLogoDataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
	return cachedSempreLogoDataUrl;
}

function budgetReportPeriodFromState(periodState = {}) {
	const now = new Date();
	const year = Number(periodState.referenceYear) || now.getFullYear();
	const month = Number(periodState.referenceMonth) || now.getMonth() + 1;
	if (periodState.mode === "last3") {
		const end = new Date(year, month - 1, 1);
		const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
		const lastDay = new Date(
			end.getFullYear(),
			end.getMonth() + 1,
			0,
		).getDate();
		return {
			mode: "custom",
			referenceYear: year,
			referenceMonth: month,
			startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
			endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
		};
	}
	if (periodState.mode === "custom") {
		return {
			mode: "custom",
			referenceYear: year,
			referenceMonth: month,
			startDate: periodState.startDate || "",
			endDate: periodState.endDate || "",
		};
	}
	return {
		mode: periodState.mode || "month",
		referenceYear: year,
		referenceMonth: month,
	};
}

function buildBudgetReportRows(config = {}, insights = {}) {
	const accountById = new Map(
		(config.accounts || []).map((account) => [account.id, account]),
	);
	const centerById = new Map(
		(config.centers || []).map((center) => [center.id, center]),
	);
	const companyById = new Map(
		(config.companies || []).map((company) => [company.id, company]),
	);
	const branchById = new Map(
		(config.branches || []).map((branch) => [branch.id, branch]),
	);
	const analyticalCenterRows = (insights.centerRows || [])
		.filter(({ center }) => center?.tipoPlano === "A")
		.sort((a, b) => b.percent - a.percent);
	const directorateByName = new Map(
		(config.settings?.directorates || []).map((item) => [
			String(item.nome || item.name || "")
				.trim()
				.toLowerCase(),
			item,
		]),
	);
	const directorates = (insights.centerSummary || []).reduce((map, item) => {
		const rawName = String(
			item.center?.diretoria || item.center?.directorate || "",
		).trim();
		const key = rawName.toLowerCase() || "sem-diretoria";
		const directorate = directorateByName.get(key);
		const current = map.get(key) || {
			id: key,
			nome: rawName || "Diretoria não informada",
			diretor: directorate?.diretor || directorate?.director || "",
			planned: 0,
			realized: 0,
			centers: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		current.centers += 1;
		map.set(key, current);
		return map;
	}, new Map());
	return {
		accountById,
		centerById,
		companyById,
		branchById,
		analyticalCenterRows,
		directorates: Array.from(directorates.values())
			.map((item) => ({
				...item,
				available: Number(item.planned || 0) - Number(item.realized || 0),
				percent: item.planned ? (item.realized / item.planned) * 100 : 0,
			}))
			.sort((left, right) => right.realized - left.realized),
	};
}

async function exportBudgetManagementPdf({
	config = {},
	selectedSections = [],
	periodState = {},
}) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const selectedPeriod = budgetReportPeriodFromState(periodState);
	const period = buildBudgetPeriod(selectedPeriod);
	const insights = getBudgetInsightsFromStatement(config, selectedPeriod);
	const rows = buildBudgetReportRows(config, insights);
	const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 10;
	const headerHeight = 26;
	const footerHeight = 10;
	let y = headerHeight + 8;

	const lineChart = (items, options = {}) => {
		const labels = items.map((item) => item.label);
		const values = items.map((item) => Number(item.value || 0));
		const forecast = items.map((item) => Number(item.forecast || 0));
		const width = options.width || pageWidth - margin * 2;
		const height = options.height || 46;
		const x = options.x || margin;
		const max = Math.max(...values, ...forecast, 1);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(x, y, width, height, 2, 2, "S");
		const plotX = x + 8;
		const plotY = y + 7;
		const plotW = width - 18;
		const plotH = height - 18;
		const drawSeries = (series, color, dashed = false) => {
			pdf.setDrawColor(...color);
			pdf.setLineWidth(0.8);
			if (dashed) pdf.setLineDashPattern([2, 2], 0);
			series.forEach((value, index) => {
				const px =
					plotX +
					(series.length <= 1 ? 0 : (index / (series.length - 1)) * plotW);
				const py = plotY + plotH - (value / max) * plotH;
				if (index > 0) {
					const prevX = plotX + ((index - 1) / (series.length - 1)) * plotW;
					const prevY = plotY + plotH - (series[index - 1] / max) * plotH;
					pdf.line(prevX, prevY, px, py);
				}
				pdf.setFillColor(...color);
				pdf.circle(px, py, 1.2, "F");
			});
			pdf.setLineDashPattern([], 0);
		};
		drawSeries(values, [37, 99, 235]);
		if (forecast.some(Boolean)) drawSeries(forecast, [249, 115, 22], true);
		pdf.setFontSize(6.5);
		pdf.setTextColor(100, 116, 139);
		labels
			.filter((_, index) => index % Math.ceil(labels.length / 6 || 1) === 0)
			.forEach((label, index) => {
				pdf.text(
					String(label).slice(0, 10),
					plotX + index * (plotW / 5),
					y + height - 4,
				);
			});
		y += height + 6;
	};

	const barChart = (items, options = {}) => {
		const width = options.width || pageWidth - margin * 2;
		const height =
			options.height || Math.max(36, Math.min(72, items.length * 7 + 14));
		const x = options.x || margin;
		const max = Math.max(
			...items.flatMap((item) => [
				Number(item.value || 0),
				Number(item.value2 || 0),
			]),
			1,
		);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(x, y, width, height, 2, 2, "S");
		const rowH = Math.max(
			5,
			Math.min(8, (height - 8) / Math.max(items.length, 1)),
		);
		items.slice(0, Math.floor((height - 8) / rowH)).forEach((item, index) => {
			const rowY = y + 6 + index * rowH;
			const labelW = options.labelWidth || 62;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6.7);
			pdf.setTextColor(51, 65, 85);
			pdf.text(String(item.label || "-").slice(0, 38), x + 4, rowY + 2.4);
			const barX = x + labelW;
			const barW = width - labelW - 34;
			pdf.setFillColor(226, 232, 240);
			pdf.roundedRect(barX, rowY - 1.2, barW, 2.8, 1, 1, "F");
			pdf.setFillColor(...(item.color || [37, 99, 235]));
			pdf.roundedRect(
				barX,
				rowY - 1.2,
				Math.max(1.8, (Number(item.value || 0) / max) * barW),
				2.8,
				1,
				1,
				"F",
			);
			if (Number(item.value2 || 0)) {
				pdf.setFillColor(249, 115, 22);
				pdf.roundedRect(
					barX,
					rowY + 2.1,
					Math.max(1.8, (Number(item.value2 || 0) / max) * barW),
					2.2,
					1,
					1,
					"F",
				);
			}
			pdf.setTextColor(15, 23, 42);
			pdf.text(
				brl.format(Number(item.value || 0)).slice(0, 16),
				x + width - 31,
				rowY + 2.5,
			);
		});
		y += height + 6;
	};

	const groupedMonthlyChart = (items = []) => {
		const width = pageWidth - margin * 2;
		const height = 58;
		const x = margin;
		ensureSpace(height + 12);
		const max = Math.max(
			...items.flatMap((item) => [
				Number(item.planned || 0),
				Number(item.realized || 0),
			]),
			1,
		);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(x, y, width, height, 2, 2, "S");
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(7);
		pdf.setTextColor(37, 99, 235);
		pdf.setFillColor(37, 99, 235);
		pdf.rect(x + 6, y + 5, 4, 3, "F");
		pdf.text("Orçado", x + 12, y + 8);
		pdf.setTextColor(249, 115, 22);
		pdf.setFillColor(249, 115, 22);
		pdf.rect(x + 35, y + 5, 4, 3, "F");
		pdf.text("Realizado", x + 41, y + 8);
		const plotX = x + 7;
		const plotY = y + 13;
		const plotW = width - 14;
		const plotH = height - 24;
		const groupW = plotW / Math.max(items.length, 1);
		items.forEach((item, index) => {
			const centerX = plotX + index * groupW + groupW / 2;
			const barW = Math.min(5.5, Math.max(2.8, groupW / 4));
			const plannedH = (Number(item.planned || 0) / max) * plotH;
			const realizedH = (Number(item.realized || 0) / max) * plotH;
			pdf.setFillColor(37, 99, 235);
			pdf.roundedRect(
				centerX - barW - 0.8,
				plotY + plotH - plannedH,
				barW,
				Math.max(1, plannedH),
				0.8,
				0.8,
				"F",
			);
			pdf.setFillColor(249, 115, 22);
			pdf.roundedRect(
				centerX + 0.8,
				plotY + plotH - realizedH,
				barW,
				Math.max(1, realizedH),
				0.8,
				0.8,
				"F",
			);
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6);
			pdf.setTextColor(100, 116, 139);
			pdf.text(String(item.label || "").slice(0, 3), centerX, y + height - 5, {
				align: "center",
			});
		});
		y += height + 6;
	};

	const table = (title, head, body, options = {}) => {
		drawSectionTitle(title);
		autoTable(pdf, {
			startY: y,
			head: [head],
			body: body.length
				? body
				: [
						[
							"Nenhum dado encontrado",
							...Array.from({ length: head.length - 1 }, () => ""),
						],
					],
			theme: "grid",
			margin: { left: margin, right: margin },
			styles: {
				fontSize: options.fontSize || 7,
				cellPadding: options.cellPadding || 1.7,
				overflow: "linebreak",
			},
			headStyles: {
				fillColor: [15, 23, 42],
				textColor: 255,
				fontStyle: "bold",
			},
			alternateRowStyles: { fillColor: [248, 250, 252] },
		});
		y = (pdf.lastAutoTable?.finalY || y) + 6;
	};

	const ensureSpace = (height = 28) => {
		if (y + height <= pageHeight - footerHeight - 6) return;
		pdf.addPage();
		y = headerHeight + 8;
	};

	function drawSectionTitle(title) {
		ensureSpace(14);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(11);
		pdf.setTextColor(15, 23, 42);
		pdf.text(title, margin, y);
		y += 5;
	}

	const cardGrid = (items) => {
		const cols = 4;
		const gap = 4;
		const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
		const cardH = 22;
		ensureSpace(Math.ceil(items.length / cols) * (cardH + gap) + 6);
		items.forEach((item, index) => {
			const col = index % cols;
			const row = Math.floor(index / cols);
			const x = margin + col * (cardW + gap);
			const cy = y + row * (cardH + gap);
			pdf.setFillColor(...(item.fill || [248, 250, 252]));
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "F");
			pdf.setDrawColor(...(item.border || [226, 232, 240]));
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "S");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6.7);
			pdf.setTextColor(71, 85, 105);
			pdf.text(String(item.title).slice(0, 34), x + 3, cy + 5.5);
			pdf.setFontSize(12);
			pdf.setTextColor(...(item.color || [15, 23, 42]));
			pdf.text(String(item.value).slice(0, 22), x + 3, cy + 14);
			pdf.setFontSize(6);
			pdf.setTextColor(100, 116, 139);
			pdf.text(String(item.helper || "").slice(0, 42), x + 3, cy + 19);
		});
		y += Math.ceil(items.length / cols) * (cardH + gap) + 2;
	};

	const sections = {
		summary: () => {
			const deviation = budgetVarianceMeta(
				insights.plannedMonth,
				insights.realizedMonth + insights.committedMonth,
			);
			drawSectionTitle("Visão macro");
			cardGrid([
				{
					title: "Orçado no período",
					value: brl.format(insights.plannedMonth),
					helper: period.displayLabel,
					fill: [239, 246, 255],
					border: [191, 219, 254],
					color: [30, 64, 175],
				},
				{
					title: "Realizado",
					value: brl.format(insights.realizedMonth + insights.committedMonth),
					helper: `${decimal.format(insights.usedPercent)}% consumido`,
					fill: [245, 243, 255],
					border: [221, 214, 254],
					color: [91, 33, 182],
				},
				{
					title: "Saldo disponível",
					value: brl.format(insights.availableMonth),
					helper:
						insights.availableMonth >= 0 ? "Dentro do orçamento" : "Estourado",
					fill:
						insights.availableMonth >= 0 ? [236, 253, 245] : [255, 241, 242],
					border:
						insights.availableMonth >= 0 ? [167, 243, 208] : [254, 205, 211],
					color: insights.availableMonth >= 0 ? [4, 120, 87] : [190, 18, 60],
				},
				{
					title: "Desvio",
					value: brl.format(deviation.variance),
					helper: `${decimal.format(deviation.percent)}%`,
					fill: [248, 250, 252],
					border: [226, 232, 240],
					color: [15, 23, 42],
				},
			]);
		},
		burnRate: () => {
			drawSectionTitle("Ritmo de consumo");
			barChart(
				[
					{
						label: "Ideal do período",
						value: insights.idealPercent,
						color: [37, 99, 235],
					},
					{
						label: "Consumido",
						value: insights.usedPercent,
						color:
							insights.usedPercent > 100
								? [239, 68, 68]
								: insights.usedPercent >= 80
									? [245, 158, 11]
									: [16, 185, 129],
					},
				],
				{ height: 32, labelWidth: 52 },
			);
		},
		villains: () => {
			drawSectionTitle("Vilões do orçamento - centros analíticos");
			barChart(
				rows.analyticalCenterRows
					.slice(0, 10)
					.map(({ center, percent, deviation }) => ({
						label: budgetCenterCompactLabel(center),
						value: Math.max(0, percent),
						color:
							percent > 100
								? [239, 68, 68]
								: percent >= 80
									? [245, 158, 11]
									: [16, 185, 129],
						helper: brl.format(Math.abs(deviation || 0)),
					})),
				{ height: 66, labelWidth: 70 },
			);
		},
		monthly: () => {
			drawSectionTitle("Orçado x realizado mensal");
			const monthlyRows = (insights.monthlyEvolution || []).map((item) => ({
				label: item.label,
				planned: Number(item.planned || 0),
				realized: Number(item.realized || 0),
			}));
			groupedMonthlyChart(monthlyRows);
			autoTable(pdf, {
				startY: y,
				head: [["Mês", "Orçado", "Realizado", "Saldo", "Uso"]],
				body: monthlyRows.map((item) => {
					const balance = item.planned - item.realized;
					const used = item.planned ? (item.realized / item.planned) * 100 : 0;
					return [
						item.label,
						brl.format(item.planned),
						brl.format(item.realized),
						brl.format(balance),
						`${decimal.format(used)}%`,
					];
				}),
				theme: "grid",
				margin: { left: margin, right: margin },
				styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
				headStyles: {
					fillColor: [15, 23, 42],
					textColor: 255,
					fontStyle: "bold",
				},
				alternateRowStyles: { fillColor: [248, 250, 252] },
			});
			y = (pdf.lastAutoTable?.finalY || y) + 6;
		},
		forecast: () => {
			drawSectionTitle("Tendência e forecast");
			lineChart(
				(insights.forecastRows || []).map((item) => ({
					label: item.label,
					value: item.cumulativeRealized,
					forecast: item.forecast,
				})),
				{ height: 58 },
			);
		},
		waterfall: () => {
			drawSectionTitle("Cascata por conta financeira");
			const body = [
				["Orçamento do período", brl.format(insights.plannedMonth), "Base"],
				...(insights.accountSummary || [])
					.slice(0, 8)
					.map((item) => [
						budgetAccountLabel(item.account, item.id),
						`- ${brl.format(item.realized)}`,
						"Realizado",
					]),
				[
					"Saldo após realizados",
					brl.format(insights.availableMonth),
					insights.availableMonth >= 0 ? "Positivo" : "Estourado",
				],
			];
			table("Composição", ["Conta", "Valor", "Tipo"], body, { fontSize: 7 });
		},
		accounts: () => {
			drawSectionTitle("Contas financeiras");
			barChart(
				(insights.accountSummary || []).slice(0, 10).map((item) => ({
					label: budgetAccountLabel(item.account, item.id),
					value: item.planned,
					value2: item.realized,
					color: [15, 118, 110],
				})),
				{ height: 76, labelWidth: 82 },
			);
		},
		centers: () => {
			drawSectionTitle("Centros de custo");
			barChart(
				(insights.centerSummary || []).slice(0, 10).map((item) => ({
					label: budgetCenterCompactLabel(item.center),
					value: Math.max(0, item.planned - item.realized),
					value2: item.realized,
					color: [191, 219, 254],
				})),
				{ height: 76, labelWidth: 78 },
			);
		},
		suppliers: () => {
			drawSectionTitle("Concentração por fornecedor");
			barChart(
				(insights.supplierSummary || []).slice(0, 12).map((item, index) => ({
					label: item.supplier,
					value: item.value,
					color: index < 5 ? [37, 99, 235] : [96, 165, 250],
				})),
				{ height: 86, labelWidth: 92 },
			);
		},
		directorates: () => {
			table(
				"Ranking por diretoria",
				[
					"Diretoria",
					"Diretor",
					"Centros",
					"Orçado",
					"Realizado",
					"Saldo",
					"Uso",
				],
				rows.directorates
					.slice(0, 14)
					.map((item) => [
						item.nome,
						item.diretor || "Não informado",
						integer.format(item.centers),
						brl.format(item.planned),
						brl.format(item.realized),
						brl.format(item.available),
						`${decimal.format(item.percent)}%`,
					]),
			);
		},
		movements: () => {
			table(
				"Todas as movimentações do período",
				["Fornecedor", "Conta", "Centro", "Matriz / filial", "Valor"],
				(insights.movements || []).map((movement) => {
					const account = rows.accountById.get(movement.accountId);
					const center = rows.centerById.get(movement.centerId);
					const company = rows.companyById.get(movement.companyId);
					const branch = rows.branchById.get(movement.branchId);
					return [
						movementSupplierName(movement),
						account
							? budgetAccountLabel(account, movement.accountId)
							: movement.accountName || movement.accountId || "-",
						center
							? budgetCenterCompactLabel(center, movement.centerId)
							: movement.centerName || movement.centerId || "-",
						[
							company?.nome || movement.companyId,
							branch?.nome || movement.branchId,
						]
							.filter(Boolean)
							.join(" / ") || "-",
						brl.format(movementValue(movement)),
					];
				}),
				{ fontSize: 6.5, cellPadding: 1.4 },
			);
		},
		approvals: () => {
			const approvals = insights.approvalsAll || insights.approvals || [];
			table(
				"Aprovações do orçamento",
				["Status", "Centro", "Responsável", "Usado / Orçado", "Motivo"],
				approvals
					.slice(0, 18)
					.map((approval) => [
						budgetApprovalStatusMeta(approval.status).label,
						approval.center?.nome || approval.centerId || "-",
						approval.center?.responsavel || "Não informado",
						`${brl.format(approval.used || 0)} / ${brl.format(approval.centerPlanned || approval.budgeted || 0)}`,
						approval.reason || "Estouro de orçamento",
					]),
				{ fontSize: 6.5, cellPadding: 1.4 },
			);
		},
	};

	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.setTextColor(15, 23, 42);
	pdf.text("Relatório de Gestão Orçamentária", margin, y);
	y += 7;
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);
	pdf.setTextColor(71, 85, 105);
	pdf.text(
		`${period.displayLabel} · Gerado em ${new Date().toLocaleString("pt-BR")} · Última importação: ${formatUpdatedAt(config.lastImportInfo?.importedAt)}`,
		margin,
		y,
	);
	y += 8;

	selectedSections.forEach((sectionId) => {
		const draw = sections[sectionId];
		if (!draw) return;
		ensureSpace(28);
		draw();
	});

	const logo = await getSempreLogoDataUrl();
	const pages = pdf.internal.getNumberOfPages();
	for (let page = 1; page <= pages; page += 1) {
		pdf.setPage(page);
		pdf.setFillColor(255, 255, 255);
		pdf.rect(0, 0, pageWidth, headerHeight, "F");
		pdf.setFillColor(5, 35, 75);
		pdf.rect(0, 0, pageWidth, 4, "F");
		pdf.setDrawColor(226, 232, 240);
		pdf.line(0, headerHeight, pageWidth, headerHeight);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(9);
		pdf.setTextColor(15, 23, 42);
		pdf.text("Sempre Internet", margin, 13);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Gestão Orçamentária", margin, 19);
		if (logo) {
			const logoHeight = 16;
			const logoWidth = logoHeight * 1.25;
			pdf.addImage(
				logo,
				"PNG",
				pageWidth - margin - logoWidth,
				6,
				logoWidth,
				logoHeight,
			);
		}
		pdf.setFillColor(248, 250, 252);
		pdf.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text(
			"Gestão Orçamentária - Sempre Internet 2026",
			margin,
			pageHeight - 4,
		);
		pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 4, {
			align: "right",
		});
	}

	pdf.save(
		`relatorio-gestao-orcamentaria-${sanitizeFileName(period.displayLabel)}-${sanitizeFileName(new Date().toISOString().slice(0, 10))}.pdf`,
	);
}

function BudgetReportExportModal({ config = {}, defaultPeriod = {}, onClose }) {
	const now = new Date();
	const initialYear = Number(
		defaultPeriod.referenceYear ||
			config.lastImportReference?.year ||
			config.lastImportSummary?.referenceYear ||
			now.getFullYear(),
	);
	const initialMonth = Number(
		defaultPeriod.referenceMonth ||
			config.lastImportReference?.month ||
			config.lastImportSummary?.referenceMonth ||
			now.getMonth() + 1,
	);
	const [selected, setSelected] = useState(() =>
		BUDGET_REPORT_OPTIONS.map((item) => item.id),
	);
	const [periodState, setPeriodState] = useState(() => ({
		mode: "month",
		referenceYear: initialYear,
		referenceMonth: Math.max(1, Math.min(12, initialMonth)),
		startDate: "",
		endDate: "",
	}));
	const [generating, setGenerating] = useState(false);
	const effectivePeriod = buildBudgetPeriod(
		budgetReportPeriodFromState(periodState),
	);

	const toggle = (id) => {
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	};

	const handleGenerate = async () => {
		setGenerating(true);
		try {
			await exportBudgetManagementPdf({
				config,
				selectedSections: selected,
				periodState,
			});
			onClose();
		} finally {
			setGenerating(false);
		}
	};

	return (
		<ModalShell
			title="Gerar Relatório"
			description="Escolha o período e os blocos que entram no PDF da gestão orçamentária."
			size="4xl"
			onClose={onClose}
			icon={
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
					<Download size={22} />
				</span>
			}
			footer={
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={() =>
							setSelected(BUDGET_REPORT_OPTIONS.map((item) => item.id))
						}
						className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Selecionar todos
					</button>
					<button
						type="button"
						onClick={handleGenerate}
						disabled={!selected.length || generating}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{generating ? (
							<Loader2 className="animate-spin" size={17} />
						) : (
							<Download size={17} />
						)}
						{generating ? "Gerando..." : "Gerar PDF"}
					</button>
				</div>
			}
		>
			<div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
				<section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<h3 className="text-sm font-black text-slate-950">Período</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						{effectivePeriod.displayLabel}
					</p>
					<div className="mt-4 grid gap-3">
						<select
							value={periodState.mode}
							onChange={(event) =>
								setPeriodState((current) => ({
									...current,
									mode: event.target.value,
								}))
							}
							className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						>
							<option value="month">Mês selecionado</option>
							<option value="last3">Últimos 3 meses</option>
							<option value="year">Ano selecionado</option>
							<option value="custom">Intervalo customizado</option>
						</select>
						{periodState.mode !== "custom" ? (
							<div className="grid gap-3 sm:grid-cols-2">
								<select
									value={periodState.referenceMonth}
									onChange={(event) =>
										setPeriodState((current) => ({
											...current,
											referenceMonth: Number(event.target.value),
										}))
									}
									disabled={periodState.mode === "year"}
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none disabled:opacity-50"
								>
									{Array.from({ length: 12 }, (_, index) => index + 1).map(
										(month) => (
											<option key={month} value={month}>
												{budgetMonthName(month)}
											</option>
										),
									)}
								</select>
								<select
									value={periodState.referenceYear}
									onChange={(event) =>
										setPeriodState((current) => ({
											...current,
											referenceYear: Number(event.target.value),
										}))
									}
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
								>
									{Array.from({ length: 7 }, (_, index) => 2026 - index).map(
										(year) => (
											<option key={year} value={year}>
												{year}
											</option>
										),
									)}
								</select>
							</div>
						) : (
							<div className="grid gap-3 sm:grid-cols-2">
								<input
									type="date"
									value={periodState.startDate}
									onChange={(event) =>
										setPeriodState((current) => ({
											...current,
											startDate: event.target.value,
										}))
									}
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
								/>
								<input
									type="date"
									value={periodState.endDate}
									onChange={(event) =>
										setPeriodState((current) => ({
											...current,
											endDate: event.target.value,
										}))
									}
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none"
								/>
							</div>
						)}
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-4">
					<h3 className="text-sm font-black text-slate-950">Conteúdo do PDF</h3>
					<div className="mt-3 grid max-h-[420px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
						{BUDGET_REPORT_OPTIONS.map((option) => (
							<label
								key={option.id}
								className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
							>
								<input
									type="checkbox"
									checked={selected.includes(option.id)}
									onChange={() => toggle(option.id)}
									className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
								/>
								{option.label}
							</label>
						))}
					</div>
				</section>
			</div>
		</ModalShell>
	);
}

async function exportSerasaReportPdf({
	selectedSections = [],
	periodLabel: selectedPeriodLabel = "",
	summary = {},
	monthly = [],
	clientTrend = [],
	operationTotals = [],
	rows = [],
	importInfo = {},
}) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 10;
	const headerHeight = 25;
	const footerHeight = 10;
	let y = headerHeight + 8;

	const ensureSpace = (height = 28) => {
		if (y + height <= pageHeight - footerHeight - 6) return;
		pdf.addPage();
		y = headerHeight + 8;
	};

	const drawSectionTitle = (title) => {
		ensureSpace(12);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(11);
		pdf.setTextColor(15, 23, 42);
		pdf.text(title, margin, y);
		y += 5;
	};

	const cardGrid = (items = []) => {
		const cols = 3;
		const gap = 4;
		const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
		const cardH = 20;
		ensureSpace(Math.ceil(items.length / cols) * (cardH + gap) + 5);
		items.forEach((item, index) => {
			const col = index % cols;
			const row = Math.floor(index / cols);
			const x = margin + col * (cardW + gap);
			const cy = y + row * (cardH + gap);
			pdf.setFillColor(...(item.fill || [248, 250, 252]));
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "F");
			pdf.setDrawColor(...(item.border || [226, 232, 240]));
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "S");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(7);
			pdf.setTextColor(71, 85, 105);
			pdf.text(String(item.title).slice(0, 38), x + 3, cy + 6);
			pdf.setFontSize(13);
			pdf.setTextColor(...(item.color || [15, 23, 42]));
			pdf.text(String(item.value).slice(0, 28), x + 3, cy + 15);
		});
		y += Math.ceil(items.length / cols) * (cardH + gap) + 2;
	};

	const barChart = (title, items = [], options = {}) => {
		drawSectionTitle(title);
		const width = options.width || pageWidth - margin * 2;
		const height = options.height || Math.max(38, Math.min(78, items.length * 8 + 12));
		const x = options.x || margin;
		ensureSpace(height + 8);
		const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(x, y, width, height, 2, 2, "S");
		const rowH = Math.max(6, Math.min(9, (height - 8) / Math.max(items.length, 1)));
		items.slice(0, Math.floor((height - 8) / rowH)).forEach((item, index) => {
			const rowY = y + 6 + index * rowH;
			const labelW = options.labelWidth || 58;
			const barX = x + labelW;
			const barW = width - labelW - 40;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6.8);
			pdf.setTextColor(51, 65, 85);
			pdf.text(String(item.label || "-").slice(0, 34), x + 4, rowY + 2.5);
			pdf.setFillColor(226, 232, 240);
			pdf.roundedRect(barX, rowY - 1.2, barW, 3, 1, 1, "F");
			pdf.setFillColor(...(item.color || [37, 99, 235]));
			pdf.roundedRect(barX, rowY - 1.2, Math.max(1.8, (Number(item.value || 0) / max) * barW), 3, 1, 1, "F");
			pdf.setTextColor(15, 23, 42);
			pdf.text(String(item.display || brl.format(Number(item.value || 0))).slice(0, 18), x + width - 36, rowY + 2.6);
		});
		y += height + 6;
	};

	const lineChart = (title, items = []) => {
		drawSectionTitle(title);
		const width = pageWidth - margin * 2;
		const height = 52;
		ensureSpace(height + 8);
		const x = margin;
		const values = items.map((item) => Number(item.value || 0));
		const max = Math.max(...values, 1);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(x, y, width, height, 2, 2, "S");
		const plotX = x + 8;
		const plotY = y + 7;
		const plotW = width - 18;
		const plotH = height - 18;
		pdf.setDrawColor(124, 58, 237);
		pdf.setFillColor(124, 58, 237);
		values.forEach((value, index) => {
			const px = plotX + (values.length <= 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);
			const py = plotY + plotH - (value / max) * plotH;
			if (index > 0) {
				const prevX = plotX + ((index - 1) / Math.max(values.length - 1, 1)) * plotW;
				const prevY = plotY + plotH - (values[index - 1] / max) * plotH;
				pdf.line(prevX, prevY, px, py);
			}
			pdf.circle(px, py, 1.3, "F");
		});
		pdf.setFontSize(6.5);
		pdf.setTextColor(100, 116, 139);
		items.forEach((item, index) => {
			if (index % Math.ceil(items.length / 6 || 1) !== 0) return;
			const px = plotX + (items.length <= 1 ? plotW / 2 : (index / (items.length - 1)) * plotW);
			pdf.text(String(item.label || "").slice(0, 12), px, y + height - 4, { align: "center" });
		});
		y += height + 6;
	};

	const table = (title, head, body, options = {}) => {
		drawSectionTitle(title);
		autoTable(pdf, {
			startY: y,
			head: [head],
			body: body.length ? body : [["Nenhum dado encontrado", ...Array.from({ length: head.length - 1 }, () => "")]],
			theme: "grid",
			margin: { left: margin, right: margin },
			styles: { fontSize: options.fontSize || 7, cellPadding: options.cellPadding || 1.6, overflow: "linebreak" },
			headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
			alternateRowStyles: { fillColor: [248, 250, 252] },
		});
		y = (pdf.lastAutoTable?.finalY || y) + 6;
	};

	const sections = {
		kpis: () => {
			drawSectionTitle("Indicadores principais");
			cardGrid([
				{ title: "Receita líquida", value: brl.format(summary.receitaLiquida || 0), fill: [239, 246, 255], border: [191, 219, 254], color: [30, 64, 175] },
				{ title: "Entradas", value: brl.format(summary.totalEntradas || 0), fill: [236, 253, 245], border: [167, 243, 208], color: [4, 120, 87] },
				{ title: "Saídas", value: brl.format(summary.totalSaidas || 0), fill: [255, 241, 242], border: [254, 205, 211], color: [190, 18, 60] },
				{ title: "Comissão", value: brl.format(summary.comissao || 0), fill: [255, 251, 235], border: [253, 230, 138], color: [180, 83, 9] },
				{ title: "Ticket médio", value: brl.format(summary.ticketMedio || 0), fill: [245, 243, 255], border: [221, 214, 254], color: [91, 33, 182] },
				{ title: "Clientes na base", value: integer.format(summary.clientes || 0), fill: [248, 250, 252], border: [226, 232, 240], color: [15, 23, 42] },
			]);
		},
		monthly: () => {
			barChart(
				"Evolução mensal Serasa",
				monthly.flatMap((item) => [
					{ label: `${item.label} entradas`, value: item.entradas, color: [16, 185, 129] },
					{ label: `${item.label} saídas`, value: item.saidas, color: [239, 68, 68] },
					{ label: `${item.label} receita`, value: item.receitaLiquida, color: [37, 99, 235] },
				]),
				{ height: 76, labelWidth: 78 },
			);
		},
		clients: () => {
			lineChart(
				"Evolução mensal Clientes Base",
				clientTrend.map((item) => ({ label: item.label || item.key, value: item.clientes })),
			);
		},
		operations: () => {
			barChart(
				"Concentração por operação",
				operationTotals.map((item) => ({
					label: item.label,
					value: item.value,
					display: brl.format(item.value),
					color: item.label === "Receita líquida" ? [37, 99, 235] : [16, 185, 129],
				})),
				{ height: 66, labelWidth: 86 },
			);
		},
		movements: () => {
			table(
				"Movimentações do período",
				["Data", "Tipo", "Descrição", "Operação", "Classificação", "Valor"],
				rows.map((row) => [
					row.date || "-",
					row.type || "-",
					row.description || "-",
					row.operation || "-",
					isSerasaNetRevenue(row) ? "Receita líquida" : Number(row.value || 0) < 0 ? "Saída" : "Entrada",
					brl.format(Number(row.value || 0)),
				]),
				{ fontSize: 6.5, cellPadding: 1.35 },
			);
		},
	};

	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.setTextColor(15, 23, 42);
	pdf.text("Relatório Serasa", margin, y);
	y += 7;
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);
	pdf.setTextColor(71, 85, 105);
	pdf.text(
		`${selectedPeriodLabel} · Gerado em ${new Date().toLocaleString("pt-BR")} · Última atualização: ${formatUpdatedAt(importInfo.importedAt)}`,
		margin,
		y,
	);
	y += 8;

	selectedSections.forEach((sectionId) => sections[sectionId]?.());

	const logo = await getSempreLogoDataUrl();
	const pages = pdf.internal.getNumberOfPages();
	for (let page = 1; page <= pages; page += 1) {
		pdf.setPage(page);
		pdf.setFillColor(255, 255, 255);
		pdf.rect(0, 0, pageWidth, headerHeight, "F");
		pdf.setFillColor(5, 35, 75);
		pdf.rect(0, 0, pageWidth, 4, "F");
		pdf.setDrawColor(226, 232, 240);
		pdf.line(0, headerHeight, pageWidth, headerHeight);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(9);
		pdf.setTextColor(15, 23, 42);
		pdf.text("Sempre Internet", margin, 13);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Reports - Serasa", margin, 19);
		if (logo) {
			const logoHeight = 16;
			const logoWidth = logoHeight * 1.25;
			pdf.addImage(logo, "PNG", pageWidth - margin - logoWidth, 6, logoWidth, logoHeight);
		}
		pdf.setFillColor(248, 250, 252);
		pdf.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Reports Serasa - Sempre Internet 2026", margin, pageHeight - 4);
		pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 4, { align: "right" });
	}

	pdf.save(
		`relatorio-serasa-${sanitizeFileName(selectedPeriodLabel)}-${sanitizeFileName(new Date().toISOString().slice(0, 10))}.pdf`,
	);
}

function SerasaReportExportModal({
	periodLabel: selectedPeriodLabel,
	summary,
	monthly,
	clientTrend,
	operationTotals,
	rows,
	importInfo,
	onClose,
}) {
	const [selected, setSelected] = useState(() =>
		SERASA_REPORT_OPTIONS.map((item) => item.id),
	);
	const [generating, setGenerating] = useState(false);
	const toggle = (id) => {
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	};
	const handleGenerate = async () => {
		setGenerating(true);
		try {
			await exportSerasaReportPdf({
				selectedSections: selected,
				periodLabel: selectedPeriodLabel,
				summary,
				monthly,
				clientTrend,
				operationTotals,
				rows,
				importInfo,
			});
			onClose();
		} finally {
			setGenerating(false);
		}
	};

	return (
		<ModalShell
			title="Gerar Relatório"
			description="Escolha os blocos que entram no PDF do Serasa."
			size="3xl"
			onClose={onClose}
			icon={
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
					<Download size={22} />
				</span>
			}
			footer={
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={() =>
							setSelected(SERASA_REPORT_OPTIONS.map((item) => item.id))
						}
						className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Selecionar todos
					</button>
					<button
						type="button"
						onClick={handleGenerate}
						disabled={generating || !selected.length}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
						Gerar PDF
					</button>
				</div>
			}
		>
			<div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
				Período selecionado: {selectedPeriodLabel}
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				{SERASA_REPORT_OPTIONS.map((option) => (
					<label
						key={option.id}
						className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
					>
						<input
							type="checkbox"
							checked={selected.includes(option.id)}
							onChange={() => toggle(option.id)}
							className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
						/>
						{option.label}
					</label>
				))}
			</div>
		</ModalShell>
	);
}

async function exportTariffsReportPdf({
	selectedSections = [],
	periodLabel: selectedPeriodLabel = "",
	insights = {},
	importInfo = {},
}) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 10;
	const headerHeight = 25;
	const footerHeight = 10;
	let y = headerHeight + 8;
	const ensureSpace = (height = 24) => {
		if (y + height <= pageHeight - footerHeight - 6) return;
		pdf.addPage();
		y = headerHeight + 8;
	};
	const title = (text) => {
		ensureSpace(10);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(11);
		pdf.setTextColor(15, 23, 42);
		pdf.text(text, margin, y);
		y += 5;
	};
	const fitText = (text, maxWidth) =>
		splitPdfTextToTwoLines(pdf, text, maxWidth);
	const cards = (items = []) => {
		const cols = 3;
		const gap = 4;
		const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
		const cardH = 19;
		ensureSpace(Math.ceil(items.length / cols) * (cardH + gap) + 4);
		items.forEach((item, index) => {
			const x = margin + (index % cols) * (cardW + gap);
			const cy = y + Math.floor(index / cols) * (cardH + gap);
			pdf.setFillColor(...item.fill);
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "F");
			pdf.setDrawColor(...item.border);
			pdf.roundedRect(x, cy, cardW, cardH, 2, 2, "S");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(7);
			pdf.setTextColor(71, 85, 105);
			pdf.text(item.title, x + 3, cy + 6);
			pdf.setFontSize(12);
			pdf.setTextColor(...item.color);
			pdf.text(item.value, x + 3, cy + 14);
		});
		y += Math.ceil(items.length / cols) * (cardH + gap) + 2;
	};
	const bars = (sectionTitle, items = [], valueFormatter = brl.format) => {
		title(sectionTitle);
		const visibleItems = items.slice(0, 9);
		const rowHeight = 8.5;
		const height = Math.max(36, Math.min(90, visibleItems.length * rowHeight + 10));
		ensureSpace(height + 6);
		const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
		pdf.setDrawColor(226, 232, 240);
		pdf.roundedRect(margin, y, pageWidth - margin * 2, height, 2, 2, "S");
		visibleItems.forEach((item, index) => {
			const rowY = y + 6 + index * rowHeight;
			const valueText = valueFormatter(Number(item.value || 0));
			const labelW = 62;
			const valueW = 35;
			const barX = margin + labelW + 8;
			const barW = pageWidth - margin * 2 - labelW - valueW - 16;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(6.6);
			pdf.setTextColor(51, 65, 85);
			pdf.text(fitText(item.label, labelW), margin + 4, rowY + 1.8);
			pdf.setFillColor(226, 232, 240);
			pdf.roundedRect(barX, rowY - 1, barW, 3, 1, 1, "F");
			pdf.setFillColor(37, 99, 235);
			pdf.roundedRect(barX, rowY - 1, Math.max(1.6, (Number(item.value || 0) / max) * barW), 3, 1, 1, "F");
			pdf.setTextColor(15, 23, 42);
			pdf.text(valueText, pageWidth - margin - 4, rowY + 2.3, { align: "right" });
		});
		y += height + 6;
	};
	const table = (sectionTitle, head, body, options = {}) => {
		title(sectionTitle);
		autoTable(pdf, {
			startY: y,
			head: [head],
			body: body.length ? body : [["Nenhum dado encontrado", ...Array.from({ length: head.length - 1 }, () => "")]],
			theme: "grid",
			margin: { left: margin, right: margin },
			tableWidth: "auto",
			styles: {
				fontSize: 6.5,
				cellPadding: 1.4,
				overflow: "linebreak",
				valign: "middle",
				minCellHeight: 5.5,
			},
			headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
			alternateRowStyles: { fillColor: [248, 250, 252] },
			columnStyles: options.columnStyles || {},
			didDrawPage: () => {
				y = headerHeight + 8;
			},
		});
		y = (pdf.lastAutoTable?.finalY || y) + 6;
	};
	const sections = {
		kpis: () => {
			title("Indicadores principais");
			cards([
				{ title: "Receita diária total", value: brl.format(insights.kpis?.receitaTotal || 0), fill: [239, 246, 255], border: [191, 219, 254], color: [30, 64, 175] },
				{ title: "Tarifas totais", value: brl.format(insights.kpis?.tarifasTotal || 0), fill: [255, 247, 237], border: [254, 215, 170], color: [194, 65, 12] },
				{ title: "Custo médio cobrança", value: brl.format(insights.kpis?.custoMedioCobranca || 0), fill: [236, 253, 245], border: [167, 243, 208], color: [4, 120, 87] },
				{ title: "Clientes por cobrança", value: integer.format(insights.kpis?.totalClientesCobranca || 0), fill: [245, 243, 255], border: [221, 214, 254], color: [91, 33, 182] },
				{ title: "Pagamentos lidos", value: integer.format(insights.kpis?.totalPagamentos || 0), fill: [240, 253, 250], border: [153, 246, 228], color: [15, 118, 110] },
				{ title: "Receita por cliente", value: brl.format(insights.kpis?.receitaClienteTotal || 0), fill: [248, 250, 252], border: [226, 232, 240], color: [15, 23, 42] },
			]);
		},
		boletoTariffs: () => table(
			"Tarifas de boletos por banco/forma de cobrança",
			["Banco / forma de cobrança", "Tarifa", "Formas de pagamento"],
			(insights.tarifasBoletos || []).map((item) => [
				item.bank || item.label || "-",
				formatTariffFee(item),
				item.paymentTypes || "-",
			]),
			{
				columnStyles: {
					0: { cellWidth: 86 },
					1: { cellWidth: 28, halign: "right" },
					2: { cellWidth: 58 },
				},
			},
		),
		monthlyTariffs: () => bars("Tarifas por banco", (insights.bancos || []).slice(0, 12)),
		paymentMix: () => bars("Formas de pagamento por valor", insights.pagamentoValor || []),
		billingMethods: () => table(
			"Clientes por forma de cobrança",
			["Forma de cobrança", "Clientes", "Valor aprox. p/ cobrança"],
			(insights.cobrancaClientes || []).map((item) => [
				item.label || item.method || "-",
				integer.format(Number(item.customers || item.value || 0)),
				brl.format(Number(item.estimatedValue || 0)),
			]),
			{
				columnStyles: {
					0: { cellWidth: 88 },
					1: { cellWidth: 34, halign: "right" },
					2: { cellWidth: 50, halign: "right" },
				},
			},
		),
		topClients: () => table(
			"Receita por cliente",
			["Cliente", "Valor", "Registros"],
			(insights.topClientes || []).slice(0, 20).map((item) => [item.label, brl.format(item.value), integer.format(item.count)]),
			{
				columnStyles: {
					0: { cellWidth: 104 },
					1: { cellWidth: 42, halign: "right" },
					2: { cellWidth: 26, halign: "right" },
				},
			},
		),
		invoices: () => bars("Faturas por mês", insights.faturasMensais || [], integer.format),
	};
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.setTextColor(15, 23, 42);
	pdf.text("Relatório de Tarifas", margin, y);
	y += 7;
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);
	pdf.setTextColor(71, 85, 105);
	pdf.text(
		`${selectedPeriodLabel} · Gerado em ${new Date().toLocaleString("pt-BR")} · Última atualização: ${formatUpdatedAt(importInfo.importedAt)}`,
		margin,
		y,
	);
	y += 8;
	selectedSections.forEach((sectionId) => sections[sectionId]?.());
	const logo = await getSempreLogoDataUrl();
	const pages = pdf.internal.getNumberOfPages();
	for (let page = 1; page <= pages; page += 1) {
		pdf.setPage(page);
		pdf.setFillColor(255, 255, 255);
		pdf.rect(0, 0, pageWidth, headerHeight, "F");
		pdf.setFillColor(5, 35, 75);
		pdf.rect(0, 0, pageWidth, 4, "F");
		pdf.setDrawColor(226, 232, 240);
		pdf.line(0, headerHeight, pageWidth, headerHeight);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(9);
		pdf.setTextColor(15, 23, 42);
		pdf.text("Sempre Internet", margin, 13);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Reports - Tarifas", margin, 19);
		if (logo) {
			const logoHeight = 16;
			const logoWidth = logoHeight * 1.25;
			pdf.addImage(logo, "PNG", pageWidth - margin - logoWidth, 6, logoWidth, logoHeight);
		}
		pdf.setFillColor(248, 250, 252);
		pdf.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
		pdf.setFontSize(7);
		pdf.setTextColor(100, 116, 139);
		pdf.text("Reports Tarifas - Sempre Internet 2026", margin, pageHeight - 4);
		pdf.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 4, { align: "right" });
	}
	pdf.save(
		`relatorio-tarifas-${sanitizeFileName(selectedPeriodLabel)}-${sanitizeFileName(new Date().toISOString().slice(0, 10))}.pdf`,
	);
}

function TariffsReportExportModal({ periodLabel, insights, importInfo, onClose }) {
	const [selected, setSelected] = useState(() =>
		TARIFFS_REPORT_OPTIONS.map((item) => item.id),
	);
	const [generating, setGenerating] = useState(false);
	const toggle = (id) => {
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	};
	const handleGenerate = async () => {
		setGenerating(true);
		try {
			await exportTariffsReportPdf({
				selectedSections: selected,
				periodLabel,
				insights,
				importInfo,
			});
			onClose();
		} finally {
			setGenerating(false);
		}
	};
	return (
		<ModalShell
			title="Gerar Relatório"
			description="Escolha os blocos que entram no PDF de Tarifas."
			size="3xl"
			onClose={onClose}
			icon={
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
					<Download size={22} />
				</span>
			}
			footer={
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="button"
						onClick={() =>
							setSelected(TARIFFS_REPORT_OPTIONS.map((item) => item.id))
						}
						className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Selecionar todos
					</button>
					<button
						type="button"
						onClick={handleGenerate}
						disabled={generating || !selected.length}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
					>
						{generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
						Gerar PDF
					</button>
				</div>
			}
		>
			<div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm font-bold text-orange-800">
				Período selecionado: {periodLabel}
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				{TARIFFS_REPORT_OPTIONS.map((option) => (
					<label
						key={option.id}
						className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
					>
						<input
							type="checkbox"
							checked={selected.includes(option.id)}
							onChange={() => toggle(option.id)}
							className="h-5 w-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
						/>
						{option.label}
					</label>
				))}
			</div>
		</ModalShell>
	);
}

function EmptyState({
	text = "Nenhum dado encontrado para o período selecionado.",
}) {
	return (
		<div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
			{text}
		</div>
	);
}

function getVisibleError(
	error,
	fallback = "Não foi possível concluir a ação.",
) {
	const message = error?.message || fallback;
	const detailParts = [
		error?.status ? `HTTP ${error.status}` : "",
		error?.details,
		error?.data && typeof error.data === "object"
			? JSON.stringify(error.data, null, 2)
			: "",
	].filter(Boolean);
	return {
		message,
		details: detailParts.join("\n\n"),
	};
}

function FeedbackModal({ feedback, onClose }) {
	if (!feedback) return null;
	const isError = feedback.type === "error";
	return (
		<ModalShell
			title={feedback.title || (isError ? "Erro na operação" : "Aviso")}
			description={feedback.description}
			icon={isError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
			onClose={onClose}
			size="lg"
			footer={
				<button
					type="button"
					onClick={onClose}
					className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
				>
					Entendi
				</button>
			}
		>
			<div
				className={`rounded-2xl border p-4 text-sm font-bold ${isError ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
			>
				{feedback.message}
			</div>
			{feedback.details ? (
				<pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs font-semibold text-slate-100">
					{feedback.details}
				</pre>
			) : null}
		</ModalShell>
	);
}

function BudgetDateRangeModal({ value, onClose, onApply }) {
	const today = new Date();
	const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
		.toISOString()
		.slice(0, 10);
	const currentDay = today.toISOString().slice(0, 10);
	const [form, setForm] = useState({
		startDate: value?.startDate || firstDay,
		endDate: value?.endDate || currentDay,
	});
	const [error, setError] = useState("");

	const updateField = (field, fieldValue) => {
		setError("");
		setForm((current) => ({ ...current, [field]: fieldValue }));
	};

	const submit = () => {
		if (!form.startDate || !form.endDate) {
			setError("Informe a data inicial e a data final.");
			return;
		}
		if (form.startDate > form.endDate) {
			setError("A data inicial não pode ser maior que a data final.");
			return;
		}
		onApply(form);
	};

	return (
		<ModalShell
			title="Selecionar datas"
			description="Filtre a gestão orçamentária por um intervalo específico."
			icon={<CalendarClock size={20} />}
			onClose={onClose}
			size="md"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={submit}
						className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
					>
						Aplicar
					</button>
				</div>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data inicial
					<input
						type="date"
						value={form.startDate}
						onChange={(event) => updateField("startDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data final
					<input
						type="date"
						value={form.endDate}
						onChange={(event) => updateField("endDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
			</div>
			{error ? (
				<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
		</ModalShell>
	);
}

function BudgetDropdownSection({
	title,
	description,
	count,
	action,
	children,
	items = [],
	renderItem,
	emptyText,
	pageSize = 6,
	className = "",
	open = false,
}) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const visibleItems = items.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);

	return (
		<details
			open={open}
			className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
		>
			<summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<span>
					<span className="flex items-center gap-2 text-sm font-black text-slate-950">
						{title}
						<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
							{integer.format(count ?? items.length)}
						</span>
					</span>
					{description ? (
						<span className="mt-1 block text-xs font-bold text-slate-500">
							{description}
						</span>
					) : null}
				</span>
			</summary>
			<div className="mt-4">
				{action ? <div className="mb-4 flex justify-end">{action}</div> : null}
				{children ||
					(items.length ? (
						<>
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
								{visibleItems.map((item, index) => renderItem(item, index))}
							</div>
							{totalPages > 1 ? (
								<div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
									<span className="px-2 text-xs font-black text-slate-500">
										Página {integer.format(currentPage)} de{" "}
										{integer.format(totalPages)} ·{" "}
										{integer.format(items.length)} registro(s)
									</span>
									<span className="flex gap-2">
										<button
											type="button"
											onClick={() => setPage((value) => Math.max(1, value - 1))}
											disabled={currentPage <= 1}
											className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
										>
											Anterior
										</button>
										<button
											type="button"
											onClick={() =>
												setPage((value) => Math.min(totalPages, value + 1))
											}
											disabled={currentPage >= totalPages}
											className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
										>
											Próxima
										</button>
									</span>
								</div>
							) : null}
						</>
					) : (
						<p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
							{emptyText || "Nenhum registro encontrado."}
						</p>
					))}
			</div>
		</details>
	);
}

function CardFooterLink({ to, children }) {
	return (
		<Link
			to={to}
			className="mt-auto flex min-h-11 items-center justify-between rounded-xl border-t border-slate-100 pt-3 text-sm font-bold text-blue-700 hover:text-blue-800"
		>
			<span>{children}</span>
			<ArrowRight size={18} />
		</Link>
	);
}

function PanelActionButton({ onClick, label = "Ver mais" }) {
	if (!onClick) return null;
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 hover:border-blue-200 hover:bg-blue-100"
		>
			<Eye size={15} />
			{label}
		</button>
	);
}

function FinancePanel({
	title,
	children,
	actionTo,
	actionLabel,
	headerExtra,
	className = "",
	onViewMore,
	viewMoreLabel,
}) {
	return (
		<section
			className={`flex h-full min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
		>
			{title || headerExtra ? (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					{title ? (
						<h2 className="text-sm font-bold text-slate-950">{title}</h2>
					) : (
						<span />
					)}
					<div className="flex flex-wrap items-center justify-end gap-2">
						{headerExtra}
						<PanelActionButton onClick={onViewMore} label={viewMoreLabel} />
					</div>
				</div>
			) : null}
			{children}
			{actionTo ? (
				<CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink>
			) : null}
		</section>
	);
}

function ChartCard({
	title,
	children,
	empty,
	actionTo,
	actionLabel,
	headerExtra,
	onViewMore,
	viewMoreLabel,
	className = "",
	bodyClassName = "",
}) {
	return (
		<section
			className={`flex h-full min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
		>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="text-sm font-bold text-slate-950">{title}</h2>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{headerExtra}
					<PanelActionButton onClick={onViewMore} label={viewMoreLabel} />
				</div>
			</div>
			{empty ? (
				<EmptyState />
			) : (
				<div className={`min-h-[250px] flex-1 ${bodyClassName}`}>
					{children}
				</div>
			)}
			{actionTo ? (
				<CardFooterLink to={actionTo}>{actionLabel}</CardFooterLink>
			) : null}
		</section>
	);
}

function renderSupplierDetailTable(
	rows = [],
	centerById = new Map(),
	accountById = new Map(),
) {
	return (
		<div className="overflow-auto rounded-2xl border border-slate-200">
			<table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-left text-xs font-bold">
				<thead className="bg-slate-50 text-slate-500">
					<tr>
						<th className="w-[280px] px-4 py-3">Fornecedor</th>
						<th className="w-[150px] px-4 py-3 text-right">Valor acumulado</th>
						<th className="w-[120px] px-4 py-3 text-right">Participação</th>
						<th className="w-[320px] px-4 py-3">Centros de custo</th>
						<th className="w-[310px] px-4 py-3">Contas financeiras</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{rows.length ? (
						rows.map((supplier) => (
							<tr key={supplier.supplier}>
								<td className="break-words px-4 py-3 align-top font-black text-slate-950">
									{supplier.supplier}
								</td>
								<td className="px-4 py-3 text-right align-top font-black text-slate-900">
									{brl.format(supplier.value)}
								</td>
								<td className="px-4 py-3 text-right align-top text-slate-700">
									{decimal.format(supplier.share)}%
								</td>
								<td className="break-words px-4 py-3 align-top leading-relaxed text-slate-600">
									{supplier.centers
										.map((id) => centerById.get(id)?.nome || id)
										.join(", ") || "-"}
								</td>
								<td className="break-words px-4 py-3 align-top leading-relaxed text-slate-600">
									{supplier.accounts
										.map((id) => accountById.get(id)?.nome || id)
										.join(", ") || "-"}
								</td>
							</tr>
						))
					) : (
						<tr>
							<td colSpan={5}>
								<EmptyState text="Nenhum fornecedor encontrado no período." />
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function renderMovementsDetailTable(
	rows = [],
	accountById = new Map(),
	centerById = new Map(),
	companyById = new Map(),
	branchById = new Map(),
) {
	return (
		<div className="overflow-auto rounded-2xl border border-slate-200">
			<table className="min-w-[1180px] table-fixed divide-y divide-slate-200 text-left text-xs font-bold">
				<thead className="bg-slate-50 text-slate-500">
					<tr>
						<th className="w-[260px] px-4 py-3">Fornecedor</th>
						<th className="w-[260px] px-4 py-3">Conta financeira</th>
						<th className="w-[220px] px-4 py-3">Centro de custo</th>
						<th className="w-[220px] px-4 py-3">Matriz / filial</th>
						<th className="w-[120px] px-4 py-3">Referência</th>
						<th className="w-[120px] px-4 py-3 text-right">Valor</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{rows.length ? (
						rows.map((movement) => {
							const account = accountById.get(movement.accountId);
							const center = centerById.get(movement.centerId);
							const company = companyById.get(movement.companyId);
							const branch = branchById.get(movement.branchId);
							return (
								<tr key={movement.id}>
									<td className="break-words px-4 py-3 align-top font-black text-slate-950">
										{movementSupplierName(movement)}
									</td>
									<td className="break-words px-4 py-3 align-top text-slate-600">
										{account
											? budgetAccountLabel(account, movement.accountId)
											: movement.accountName || movement.accountId || "-"}
									</td>
									<td className="break-words px-4 py-3 align-top text-slate-600">
										{center
											? budgetCenterCompactLabel(center, movement.centerId)
											: movement.centerName || movement.centerId || "-"}
									</td>
									<td className="break-words px-4 py-3 align-top text-slate-600">
										{[
											company?.nome || movement.companyId,
											branch?.nome || movement.branchId,
										]
											.filter(Boolean)
											.join(" / ") || "-"}
									</td>
									<td className="px-4 py-3 align-top text-slate-600">
										{[movement.year, budgetMonthName(movement.month)]
											.filter(Boolean)
											.join(" - ") || "-"}
									</td>
									<td className="px-4 py-3 text-right align-top font-black text-slate-950">
										{brl.format(movementValue(movement))}
									</td>
								</tr>
							);
						})
					) : (
						<tr>
							<td colSpan={6}>
								<EmptyState text="Nenhuma movimentação importada no período." />
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function compactChartLabel(value, max = 36) {
	const text = String(value || "").trim();
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trim()}…`;
}

function smartCurrencyStep(maxValue = 0) {
	const max = Math.max(0, Number(maxValue || 0));
	if (max <= 0) return 1000;
	const raw = max / 6;
	const exponent = Math.floor(Math.log10(raw || 1));
	const base = 10 ** exponent;
	const normalized = raw / base;
	const multiplier =
		normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return Math.max(1000, multiplier * base);
}

function supplierBarOptions(labels = [], values = []) {
	const maxValue = Math.max(...values.map((value) => Number(value || 0)), 0);
	const step = smartCurrencyStep(maxValue);
	return {
		...barOptions(),
		indexAxis: "y",
		layout: { padding: { left: 8, right: 18 } },
		plugins: {
			...barOptions().plugins,
			legend: { display: false },
			tooltip: {
				callbacks: {
					title: (items) => labels[items?.[0]?.dataIndex] || "",
					label: (context) =>
						`Realizado: ${brl.format(Number(context.raw || 0))}`,
				},
			},
		},
		scales: {
			x: {
				beginAtZero: true,
				suggestedMax: Math.ceil(maxValue / step) * step,
				ticks: {
					stepSize: step,
					callback: (value) => brl.format(Number(value || 0)),
					font: { weight: "bold" },
				},
				grid: { color: "rgba(148,163,184,.18)" },
			},
			y: {
				ticks: {
					autoSkip: false,
					callback(value) {
						return compactChartLabel(this.getLabelForValue(value), 42);
					},
					font: { size: 11, weight: "bold" },
				},
				grid: { display: false },
			},
		},
	};
}

function barOptions(formatter = brl.format) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				labels: { boxWidth: 10, font: { weight: "bold" } },
			},
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.dataset.label}: ${formatter(Number(context.raw || 0))}`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: { ticks: { callback: (value) => formatter(Number(value)) } },
		},
	};
}

function lineOptions(formatter = decimal.format) {
	return {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				display: true,
				labels: { boxWidth: 10, font: { weight: "bold" } },
			},
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.dataset.label}: ${formatter(Number(context.raw || 0))}%`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: {
				ticks: { callback: (value) => `${formatter(Number(value))}%` },
				suggestedMin: 0,
			},
		},
	};
}

function DashboardContent({ data, loading }) {
	const hasData = data?.source && data.source !== "empty";
	const billingChart = useMemo(
		() => ({
			labels: (data?.lastBillings || []).map((item) => item.label),
			datasets: [
				{
					label: "Faturamento",
					data: (data?.lastBillings || []).map((item) => item.value),
					backgroundColor: "#2563eb",
					borderRadius: 10,
				},
			],
		}),
		[data?.lastBillings],
	);
	const receivablesChart = useMemo(
		() => ({
			labels: (data?.receivables || []).map((item) => item.label),
			datasets: [
				{
					label: "Previsto",
					data: (data?.receivables || []).map((item) => item.previsto),
					backgroundColor: "#1d4ed8",
					borderRadius: 10,
				},
				{
					label: "Recebido",
					data: (data?.receivables || []).map((item) => item.recebido),
					backgroundColor: "#f97316",
					borderRadius: 10,
				},
			],
		}),
		[data?.receivables],
	);
	const methodsChart = useMemo(
		() => ({
			labels: (data?.paymentMethods || []).map((item) => item.label),
			datasets: [
				{
					data: (data?.paymentMethods || []).map((item) => item.value),
					backgroundColor: [
						"#1d4ed8",
						"#f97316",
						"#10b981",
						"#8b5cf6",
						"#64748b",
					],
					borderWidth: 0,
				},
			],
		}),
		[data?.paymentMethods],
	);
	const paymentTotal = useMemo(
		() =>
			(data?.paymentMethods || []).reduce(
				(sum, item) => sum + Number(item.value || 0),
				0,
			),
		[data?.paymentMethods],
	);
	const evolutionChart = useMemo(
		() => ({
			labels: (data?.revenueEvolution || []).map((item) => item.label),
			datasets: [
				{
					label: "Recebido acumulado",
					data: (data?.revenueEvolution || []).map((item) => item.value),
					borderColor: "#2563eb",
					backgroundColor: "rgba(37, 99, 235, 0.12)",
					fill: true,
					tension: 0.35,
				},
			],
		}),
		[data?.revenueEvolution],
	);
	const revenueTotal = Number(
		(data?.revenueEvolution || []).at(-1)?.value || 0,
	);

	return (
		<>
			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
				{(
					data?.kpis ||
					Array.from({ length: 10 }, (_, index) => ({
						id: `loading-${index}`,
						title: "Indicador",
						value: 0,
					}))
				).map((item, index) => (
					<FinancialKpiCard
						key={item.id}
						item={item}
						loading={loading}
						index={index}
					/>
				))}
			</section>

			{!hasData && !loading ? (
				<EmptyState text="Nenhum dado financeiro real disponível. Configure as planilhas financeiras para alimentar esta visão." />
			) : null}

			<section className="grid gap-4 xl:grid-cols-4">
				<ChartCard
					title="Últimos 5 faturamentos do mês"
					empty={!data?.lastBillings?.length}
					actionTo={ROUTES.FINANCEIRO_FATURAMENTO}
					actionLabel="Ver faturamento"
				>
					<Bar data={billingChart} options={barOptions()} />
				</ChartCard>
				<ChartCard
					title="Previsão de contas a receber / Recebidas"
					empty={!data?.receivables?.length}
					actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER}
					actionLabel="Ver contas a receber"
				>
					<Bar data={receivablesChart} options={barOptions()} />
				</ChartCard>
				<ChartCard
					title="Recebimentos por forma de pagamento"
					empty={!data?.paymentMethods?.length}
					actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER}
					actionLabel="Ver formas de pagamento"
				>
					<div className="grid h-full min-h-[250px] items-center gap-4 md:grid-cols-[0.9fr_1.1fr]">
						<div className="h-[240px]">
							<Doughnut
								data={methodsChart}
								options={{
									responsive: true,
									maintainAspectRatio: false,
									cutout: "62%",
									plugins: {
										legend: { display: false },
										tooltip: {
											callbacks: {
												label: (ctx) =>
													`${ctx.label}: ${brl.format(Number(ctx.raw || 0))}`,
											},
										},
									},
								}}
							/>
						</div>
						<div className="space-y-3">
							{(data?.paymentMethods || []).map((method, index) => {
								const colors = [
									"#1d4ed8",
									"#f97316",
									"#10b981",
									"#8b5cf6",
									"#64748b",
								];
								const percent = paymentTotal
									? (Number(method.value || 0) / paymentTotal) * 100
									: 0;
								return (
									<div key={method.label} className="flex items-start gap-3">
										<span
											className="mt-1 h-3 w-3 shrink-0 rounded-full"
											style={{ backgroundColor: colors[index % colors.length] }}
										/>
										<div className="min-w-0">
											<p className="text-sm font-bold text-slate-950">
												{method.label}
											</p>
											<p className="text-xs font-bold text-slate-600">
												{brl.format(Number(method.value || 0))} (
												{decimal.format(percent)}%)
											</p>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				</ChartCard>
				<ChartCard
					title="Evolução do recebimento no mês"
					empty={!data?.revenueEvolution?.length}
					actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER}
					actionLabel="Ver evolução completa"
					headerExtra={
						revenueTotal ? (
							<span className="rounded-xl bg-blue-50 px-3 py-2 text-right text-xs font-bold text-blue-700">
								Total do mês
								<br />
								{brl.format(revenueTotal)}
							</span>
						) : null
					}
				>
					<Line data={evolutionChart} options={barOptions()} />
				</ChartCard>
			</section>

			<section className="grid gap-4 xl:grid-cols-4">
				<FinancePanel
					title="Top cidades por faturamento"
					actionTo={ROUTES.FINANCEIRO_FATURAMENTO}
					actionLabel="Ver todas as cidades"
				>
					<div className="mt-4 flex flex-1 flex-col justify-between gap-3">
						{(data?.citiesRanking || []).length ? (
							data.citiesRanking.map((city) => {
								const max = Math.max(
									...data.citiesRanking.map((item) => Number(item.value || 0)),
									1,
								);
								return (
									<div
										key={city.label}
										className="grid grid-cols-[minmax(90px,1fr)_minmax(80px,1fr)_auto] items-center gap-3 text-xs font-bold"
									>
										<span className="truncate text-slate-700">
											{city.label}
										</span>
										<div className="h-3 rounded-full bg-slate-100">
											<div
												className="h-full rounded-full bg-blue-600"
												style={{
													width: `${Math.max(8, (Number(city.value || 0) / max) * 100)}%`,
												}}
											/>
										</div>
										<span className="whitespace-nowrap text-slate-950">
											{brl.format(city.value)}
										</span>
									</div>
								);
							})
						) : (
							<EmptyState />
						)}
					</div>
				</FinancePanel>
				<FinancePanel
					title="Alertas financeiros"
					actionTo={ROUTES.FINANCEIRO_CONTAS_RECEBER}
					actionLabel="Ver todos os alertas"
				>
					<div className="mt-4 flex flex-1 flex-col gap-3">
						{(data?.alerts || []).length ? (
							data.alerts.map((alert) => (
								<div
									key={alert.id}
									className={`flex-1 rounded-2xl border p-3 ${alert.severity === "critical" ? "border-red-200 bg-red-50" : alert.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}
								>
									<p className="text-sm font-bold text-slate-950">
										{alert.title}
									</p>
									<p className="mt-1 text-xs font-bold text-slate-600">
										{alert.description}
									</p>
								</div>
							))
						) : (
							<EmptyState />
						)}
					</div>
				</FinancePanel>
				<FinancePanel
					title="Resumo operacional do dia"
					actionTo={ROUTES.FINANCEIRO_REPORTS_SERASA}
					actionLabel="Ver relatório completo"
				>
					<dl className="mt-4 flex flex-1 flex-col justify-between divide-y divide-slate-100">
						{[
							["Notas lançadas", data?.operationalSummary?.notasLancadas],
							[
								"Pagamentos conciliados",
								data?.operationalSummary?.pagamentosConciliados,
							],
							[
								"Valor conciliado",
								brl.format(
									Number(data?.operationalSummary?.valorConciliado || 0),
								),
							],
							[
								"Tickets resolvidos",
								data?.operationalSummary?.ticketsResolvidos,
							],
							[
								"Pendências em aberto",
								data?.operationalSummary?.pendenciasAbertas,
							],
						].map(([label, value]) => (
							<div
								key={label}
								className="flex items-center justify-between gap-3 py-3"
							>
								<dt className="text-xs font-bold text-slate-600">{label}</dt>
								<dd className="whitespace-nowrap text-sm font-bold text-slate-950">
									{value || 0}
								</dd>
							</div>
						))}
					</dl>
				</FinancePanel>
				<FinancePanel
					title="Contas a vencer"
					actionTo={ROUTES.FINANCEIRO_CONTAS_PAGAR}
					actionLabel="Ver todas as contas a vencer"
				>
					<div className="mt-4 flex-1">
						<table className="w-full table-fixed text-left text-xs">
							<thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
								<tr>
									<th className="w-[26%] px-2 py-3">Vencimento</th>
									<th className="w-[34%] px-2 py-3">Cliente / Grupo</th>
									<th className="w-[25%] px-2 py-3">Valor</th>
									<th className="w-[15%] px-2 py-3 text-center">Dias</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{(data?.upcomingAccounts || []).length ? (
									data.upcomingAccounts.map((row) => (
										<tr key={row.id}>
											<td className="px-2 py-3 font-bold text-slate-700">
												{row.vencimento}
											</td>
											<td className="px-2 py-3 font-bold text-slate-900">
												{row.nome}
											</td>
											<td className="px-2 py-3 font-bold text-slate-950">
												{brl.format(Number(row.valor || 0))}
											</td>
											<td className="px-2 py-3 text-center font-bold text-slate-700">
												{row.dias}
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={4}>
											<EmptyState />
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</FinancePanel>
			</section>
		</>
	);
}

function SectionPage({ page }) {
	const cards =
		{
			contasPagar: [
				"Total a pagar",
				"Vence hoje",
				"Vence esta semana",
				"Vencidas",
				"Pagas no mês",
			],
			contasReceber: [
				"Total a receber",
				"Receber hoje",
				"Recebido hoje",
				"Vencidos",
				"Inadimplência",
			],
			faturamento: [
				"Faturamento do mês",
				"Mês anterior",
				"Crescimento",
				"Receita recorrente",
				"Receita não recorrente",
			],
			notas: [
				"Notas hoje",
				"Notas no mês",
				"Pendentes",
				"Com erro",
				"Valor total",
			],
			chamados: [
				"Abertos",
				"Em andamento",
				"Encerrados no mês",
				"SLA vencido",
				"Tempo médio",
			],
			orcamentoDashboard: [
				"Orçado no mês",
				"Realizado",
				"Saldo disponível",
				"Desvio",
				"Solicitações",
			],
			orcamentoCentrosCusto: [
				"Centros ativos",
				"Sem responsável",
				"No limite",
				"Acima do previsto",
				"Novos no mês",
			],
			orcamentoDre: [
				"Previsto",
				"Realizado",
				"Comprometido",
				"Disponível",
				"Variação",
			],
			orcamentoAprovacoes: [
				"Pendentes",
				"Aprovadas",
				"Reprovadas",
				"SLA vencido",
				"Valor em análise",
			],
			orcamentoConfiguracoes: [
				"Categorias",
				"Alçadas",
				"Responsáveis",
				"Regras ativas",
				"Integrações",
			],
		}[page] || [];
	const isBudgetPage = String(page || "").startsWith("orcamento");
	return (
		<>
			<section className="grid gap-4 md:grid-cols-5">
				{cards.map((card) => (
					<FinancialKpiCard
						key={card}
						item={{
							title: card,
							value: 0,
							type: "number",
							icon: "BadgeDollarSign",
						}}
					/>
				))}
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-bold text-slate-950">
					{isBudgetPage ? "Módulo protegido por VPN" : "Estrutura preparada"}
				</h2>
				<p className="mt-2 text-sm font-semibold text-slate-500">
					{isBudgetPage
						? "Esta área já está integrada ao menu, RBAC e trava de VPN. Cadastre as faixas de IP em Configuração > VPN e ative a proteção antes de operar dados reais."
						: "Esta página já está integrada ao menu, RBAC e layout do sistema. A tabela e os filtros estão preparados para receber dados reais da integração financeira."}
				</p>
				<div className="mt-5 grid gap-4 lg:grid-cols-3">
					{[
						[
							"Filtros",
							"Período, empresa, regional, centro de custo e categoria.",
						],
						[
							"Auditoria",
							"Histórico de alterações, aprovações e consumo do orçamento.",
						],
						[
							"Integração",
							"Preparado para receber dados financeiros reais por planilha/API.",
						],
					].map(([title, text]) => (
						<div
							key={title}
							className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
						>
							<h3 className="text-sm font-black text-slate-950">{title}</h3>
							<p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
								{text}
							</p>
						</div>
					))}
				</div>
				<EmptyState
					text={
						isBudgetPage
							? "Nenhum orçamento cadastrado ainda."
							: "Nenhum dado real integrado ainda."
					}
				/>
			</section>
		</>
	);
}

function dateFromInput(value) {
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBudgetMonthYear({ year, month } = {}) {
	const safeYear = Number(year) || new Date().getFullYear();
	const safeMonth = Number(month) || new Date().getMonth() + 1;
	return `${safeYear} - ${budgetMonthName(safeMonth)}`;
}

function formatBudgetPeriodDisplay(
	months = [],
	fallbackYear = new Date().getFullYear(),
) {
	const validMonths = months.filter(
		(item) => Number(item?.year) && Number(item?.month),
	);
	if (!validMonths.length) {
		return formatBudgetMonthYear({
			year: fallbackYear,
			month: new Date().getMonth() + 1,
		});
	}
	if (validMonths.length === 1) {
		return formatBudgetMonthYear(validMonths[0]);
	}
	const first = validMonths[0];
	const last = validMonths[validMonths.length - 1];
	return `${formatBudgetMonthYear(first)} até ${formatBudgetMonthYear(last)}`;
}

function buildBudgetPeriod(selectedPeriod = {}) {
	const now = new Date();
	const currentYear = Number(selectedPeriod.referenceYear) || now.getFullYear();
	const currentMonth =
		Number(selectedPeriod.referenceMonth) || now.getMonth() + 1;
	if (selectedPeriod.mode === "year") {
		const months = Array.from({ length: 12 }, (_, index) => ({
			year: currentYear,
			month: index + 1,
		}));
		return {
			label: "ano",
			displayLabel: `${currentYear} - Ano`,
			months,
		};
	}
	if (selectedPeriod.mode === "custom") {
		const start = dateFromInput(selectedPeriod.startDate);
		const end = dateFromInput(selectedPeriod.endDate);
		if (start && end && start <= end) {
			const months = [];
			const startIndex = start.getFullYear() * 12 + start.getMonth();
			const endIndex = end.getFullYear() * 12 + end.getMonth();
			for (
				let monthIndex = startIndex;
				monthIndex <= endIndex;
				monthIndex += 1
			) {
				months.push({
					year: Math.trunc(monthIndex / 12),
					month: (monthIndex % 12) + 1,
				});
			}
			return {
				label: "período",
				displayLabel: formatBudgetPeriodDisplay(months, currentYear),
				months,
			};
		}
	}
	const months = [{ year: currentYear, month: currentMonth }];
	return {
		label: "mês",
		displayLabel: formatBudgetPeriodDisplay(months, currentYear),
		months,
	};
}

function getBudgetPeriodKey(item = {}) {
	const year = Number(item.year || item.ano || 0);
	const month = Number(item.month || item.numMes || item.mesNumero || 0);
	return year && month ? `${year}-${month}` : "";
}

function budgetPeriodMatches(item = {}, periodKeys = new Set()) {
	return periodKeys.has(getBudgetPeriodKey(item));
}

function movementValue(movement = {}) {
	return (
		Number(
			movement.value ??
				movement.valor ??
				movement.realized ??
				movement.realizado ??
				movement.total ??
				0,
		) || 0
	);
}

function movementSupplierName(movement = {}, fallback = "") {
	return (
		String(
			movement.supplier ||
				movement.fornecedor ||
				movement.partnerName ||
				movement.nomeFornecedor ||
				fallback ||
				"",
		).trim() || "Fornecedor não informado"
	);
}

function getConfiguredCenterBudget(
	center = {},
	selectedPeriod = {},
	periodMonthCount = 1,
) {
	const monthly = Number(center.valorMensal || center.orcamentoMensal || 0);
	if (selectedPeriod.mode === "year") return monthly * 12;
	return monthly * Math.max(1, periodMonthCount);
}

function centerParentKey(center = {}) {
	return (
		String(center.parentId || center.parentCodigo || "").replace(/\D+/g, "") ||
		String(center.parentId || center.parentCodigo || "")
	);
}

function centerCodeKey(center = {}) {
	return (
		String(center.codigo || center.id || "").replace(/\D+/g, "") ||
		String(center.codigo || center.id || "")
	);
}

function LEGACY_BUDGET_INSIGHTS(config = {}, selectedPeriod = {}) {
	const accounts = config.accounts || [];
	const centers = config.centers || [];
	const matrix = config.matrix || [];
	const now = new Date();
	const period = buildBudgetPeriod(selectedPeriod);
	const referenceYear = Number(period.months[0]?.year) || now.getFullYear();
	const periodKeys = new Set(
		period.months.map((item) => `${item.year}-${item.month}`),
	);
	const isCurrentSingleMonth =
		period.months.length === 1 &&
		Number(period.months[0]?.year) === now.getFullYear() &&
		Number(period.months[0]?.month) === now.getMonth() + 1;
	const activeMonth = period.months[0] || {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const daysInMonth = new Date(
		Number(activeMonth.year),
		Number(activeMonth.month),
		0,
	).getDate();
	const dayOfMonth = isCurrentSingleMonth ? now.getDate() : daysInMonth;
	const rowPeriodTotal = (row) =>
		period.months.reduce((sum, item) => {
			if (Number(row.year || item.year) !== item.year) return sum;
			return sum + Number(row.months?.[item.month - 1] || 0);
		}, 0);
	const periodMonthCount = Math.max(1, period.months.length);
	const realizedForCenter = (center) => {
		const breakdowns =
			center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
		const matchingBreakdowns = breakdowns.filter((item) =>
			periodKeys.has(getBudgetPeriodKey(item)),
		);
		const breakdownTotal = matchingBreakdowns.reduce(
			(sum, item) => sum + Number(item.realized ?? item.realizado ?? 0),
			0,
		);
		if (breakdowns.length) return breakdownTotal;
		return 0;
	};
	const childrenByParentKey = new Map();
	centers
		.filter((center) => center.tipoPlano === "A")
		.forEach((center) => {
			const parentKey = centerParentKey(center);
			if (!parentKey) return;
			const current = childrenByParentKey.get(parentKey) || [];
			current.push(center);
			childrenByParentKey.set(parentKey, current);
		});
	const analyticChildrenForCenter = (center = {}) => {
		if (center.tipoPlano !== "S") return [];
		const key = centerCodeKey(center);
		const byId = childrenByParentKey.get(center.id) || [];
		const byCode = key ? childrenByParentKey.get(key) || [] : [];
		return [...byId, ...byCode].filter(
			(child, index, items) =>
				items.findIndex((item) => item.id === child.id) === index,
		);
	};
	const centersForTotals = centers.filter((center) => center.tipoPlano !== "S");
	const configuredBudgetForCenter = (center) => {
		if (center?.tipoPlano === "S") {
			return analyticChildrenForCenter(center).reduce(
				(sum, child) =>
					sum +
					getConfiguredCenterBudget(child, selectedPeriod, periodMonthCount),
				0,
			);
		}
		return getConfiguredCenterBudget(center, selectedPeriod, periodMonthCount);
	};
	const realizedTotalForCenter = (center) => {
		if (center?.tipoPlano === "S") {
			return analyticChildrenForCenter(center).reduce(
				(sum, child) =>
					sum + realizedForCenter(child) + Number(child.comprometidoMes || 0),
				0,
			);
		}
		return realizedForCenter(center) + Number(center?.comprometidoMes || 0);
	};
	const plannedMonthFromMatrix = matrix.reduce((sum, row) => {
		const center = centers.find((item) => item.id === row.costCenterId);
		if (center?.tipoPlano === "S") return sum;
		return sum + rowPeriodTotal(row);
	}, 0);
	const plannedMonthFromCenters = centersForTotals.reduce((sum, center) => {
		return (
			sum + getConfiguredCenterBudget(center, selectedPeriod, periodMonthCount)
		);
	}, 0);
	const currentYearMatrix = matrix.filter(
		(row) => Number(row.year || referenceYear) === referenceYear,
	);
	const plannedYearFromMatrix = currentYearMatrix.reduce((sum, row) => {
		const center = centers.find((item) => item.id === row.costCenterId);
		if (center?.tipoPlano === "S") return sum;
		return (
			sum +
			(row.months || []).reduce(
				(monthSum, value) => monthSum + Number(value || 0),
				0,
			)
		);
	}, 0);
	const plannedYearFromCenters = centersForTotals.reduce(
		(sum, center) =>
			sum + getConfiguredCenterBudget(center, { mode: "year" }, 12),
		0,
	);
	const plannedMonth = plannedMonthFromCenters || plannedMonthFromMatrix;
	const plannedYear = plannedYearFromCenters || plannedYearFromMatrix;
	const realizedMonth = centersForTotals.reduce(
		(sum, center) => sum + realizedForCenter(center),
		0,
	);
	const committedMonth = centersForTotals.reduce(
		(sum, center) => sum + Number(center.comprometidoMes || 0),
		0,
	);
	const availableMonth = plannedMonth - realizedMonth - committedMonth;
	const idealBurn = plannedMonth
		? (plannedMonth / daysInMonth) * dayOfMonth
		: 0;
	const usedPercent = plannedMonth
		? ((realizedMonth + committedMonth) / plannedMonth) * 100
		: 0;
	const idealPercent = plannedMonth ? (idealBurn / plannedMonth) * 100 : 0;
	const computedApprovals = centers
		.filter((center) => center.tipoPlano !== "S")
		.map((center) => {
			const centerPlanned =
				configuredBudgetForCenter(center) ||
				matrix
					.filter((row) => row.costCenterId === center.id)
					.reduce((sum, row) => sum + rowPeriodTotal(row), 0);
			const used = realizedTotalForCenter(center);
			const percent = centerPlanned ? (used / centerPlanned) * 100 : 0;
			return {
				id: `orcamento-estouro-${center.id}-${period.months[0]?.year || now.getFullYear()}-${period.months[0]?.month || now.getMonth() + 1}`,
				type: "estouro_orcamento",
				center,
				centerPlanned,
				budgeted: centerPlanned,
				used,
				realized: realizedForCenter(center),
				committed: Number(center.comprometidoMes || 0),
				percent,
				overflow: used - centerPlanned,
				reason: `Centro de custo consumiu ${decimal.format(percent)}% do orçamento.`,
				status: "pendente",
				source: "calculado",
			};
		})
		.filter((item) => item.centerPlanned && item.percent > 100);
	const approvalMap = new Map(
		computedApprovals.map((approval) => [approval.id, approval]),
	);
	(config.approvals || []).forEach((approval) => {
		const center = centers.find((item) => item.id === approval.centerId);
		const used =
			Number(approval.realized || 0) + Number(approval.committed || 0);
		approvalMap.set(approval.id, {
			...approvalMap.get(approval.id),
			...approval,
			center,
			centerPlanned: Number(
				approval.budgeted || approvalMap.get(approval.id)?.centerPlanned || 0,
			),
			budgeted: Number(
				approval.budgeted || approvalMap.get(approval.id)?.budgeted || 0,
			),
			used: used || approvalMap.get(approval.id)?.used || 0,
			overflow: Number(
				approval.overflow || approvalMap.get(approval.id)?.overflow || 0,
			),
			percent: Number(
				approval.percent || approvalMap.get(approval.id)?.percent || 0,
			),
		});
	});
	const approvalsAll = Array.from(approvalMap.values()).sort((left, right) => {
		const leftPending = left.status === "pendente" ? 1 : 0;
		const rightPending = right.status === "pendente" ? 1 : 0;
		if (leftPending !== rightPending) return rightPending - leftPending;
		return String(right.updatedAt || right.createdAt || "").localeCompare(
			String(left.updatedAt || left.createdAt || ""),
		);
	});
	const approvals = approvalsAll.filter(
		(approval) => approval.status === "pendente",
	);
	const accountRows = matrix
		.map((row) => {
			const account = accounts.find((item) => item.id === row.accountId);
			const center = centers.find((item) => item.id === row.costCenterId);
			if (center?.tipoPlano === "S") return null;
			const rawPlanned = rowPeriodTotal(row);
			const breakdownRealized = (
				center?.realizedByCompanyBranch ||
				center?.realizadoPorEmpresaFilial ||
				[]
			)
				.filter(
					(item) =>
						item.accountId === row.accountId &&
						periodKeys.has(getBudgetPeriodKey(item)),
				)
				.reduce(
					(sum, item) => sum + Number(item.realized ?? item.realizado ?? 0),
					0,
				);
			const centerTotalPlanned = matrix
				.filter((item) => item.costCenterId === row.costCenterId)
				.reduce((sum, item) => sum + rowPeriodTotal(item), 0);
			const configuredCenterPlanned = center
				? configuredBudgetForCenter(center)
				: 0;
			const planned =
				configuredCenterPlanned && centerTotalPlanned
					? (rawPlanned / centerTotalPlanned) * configuredCenterPlanned
					: rawPlanned;
			const centerRealized = realizedTotalForCenter(center || {});
			const realized =
				breakdownRealized ||
				(configuredCenterPlanned && planned
					? (planned / configuredCenterPlanned) * centerRealized
					: centerTotalPlanned
						? (rawPlanned / centerTotalPlanned) * centerRealized
						: centerRealized);
			return {
				row,
				account,
				center,
				planned,
				realized,
				deviation: realized - planned,
			};
		})
		.filter((item) => item && (item.planned || item.realized));
	const centerRows = centers.map((center) => {
		const plannedFromCenter = configuredBudgetForCenter(center);
		const planned =
			plannedFromCenter ||
			matrix
				.filter((row) => row.costCenterId === center.id)
				.reduce((sum, row) => sum + rowPeriodTotal(row), 0);
		const realized = realizedTotalForCenter(center);
		return {
			center,
			planned,
			realized,
			deviation: realized - planned,
			percent: planned ? (realized / planned) * 100 : 0,
		};
	});
	const movements = [];
	centersForTotals.forEach((center) => {
		const breakdowns =
			center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
		breakdowns
			.filter((breakdown) => budgetPeriodMatches(breakdown, periodKeys))
			.forEach((breakdown) => {
				const breakdownMovements = Array.isArray(
					breakdown.movements || breakdown.movimentacoes,
				)
					? breakdown.movements || breakdown.movimentacoes
					: [];
				if (breakdownMovements.length) {
					breakdownMovements.forEach((movement, index) => {
						movements.push({
							...movement,
							id:
								movement.id ||
								`${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${index}`,
							centerId: center.id,
							centerName: center.nome,
							accountId: movement.accountId || breakdown.accountId,
							companyId: movement.companyId || breakdown.companyId,
							branchId: movement.branchId || breakdown.branchId,
							supplier: movementSupplierName(
								movement,
								(breakdown.suppliers || breakdown.fornecedores || [])[0],
							),
							value: movementValue(movement),
							year: Number(breakdown.year || breakdown.ano || 0),
							month: Number(breakdown.month || breakdown.numMes || 0),
						});
					});
					return;
				}
				const value =
					Number(breakdown.realized ?? breakdown.realizado ?? 0) || 0;
				movements.push({
					id: `${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${breakdown.accountId || "sem-conta"}`,
					centerId: center.id,
					centerName: center.nome,
					accountId: breakdown.accountId,
					companyId: breakdown.companyId,
					branchId: breakdown.branchId,
					supplier:
						(breakdown.suppliers || breakdown.fornecedores || [])[0] ||
						"Fornecedor não informado",
					value,
					year: Number(breakdown.year || breakdown.ano || 0),
					month: Number(breakdown.month || breakdown.numMes || 0),
				});
			});
	});
	const monthlyEvolution = Array.from({ length: 12 }, (_, index) => {
		const month = index + 1;
		const planned = centersForTotals.reduce(
			(sum, center) =>
				sum + getConfiguredCenterBudget(center, { mode: "month" }, 1),
			0,
		);
		const realized = centersForTotals.reduce((sum, center) => {
			const breakdowns =
				center.realizedByCompanyBranch ||
				center.realizadoPorEmpresaFilial ||
				[];
			return (
				sum +
				breakdowns
					.filter(
						(item) =>
							Number(item.year || item.ano || referenceYear) ===
								referenceYear &&
							Number(item.month || item.numMes || 0) === month,
					)
					.reduce(
						(monthSum, item) =>
							monthSum + Number(item.realized ?? item.realizado ?? 0),
						0,
					)
			);
		}, 0);
		return {
			month,
			label: budgetMonthName(month).slice(0, 3),
			planned,
			realized,
			percent: planned ? (realized / planned) * 100 : 0,
		};
	});
	let cumulativeRealized = 0;
	const forecastRows = monthlyEvolution.map((row, index) => {
		cumulativeRealized += row.realized;
		const elapsedWithData =
			monthlyEvolution.slice(0, index + 1).filter((item) => item.realized > 0)
				.length || index + 1;
		const average = cumulativeRealized / Math.max(1, elapsedWithData);
		return {
			...row,
			cumulativeRealized,
			forecast: row.realized ? cumulativeRealized : average * (index + 1),
		};
	});
	const accountSummaryMap = new Map();
	accountRows.forEach((item) => {
		const key = item.account?.id || item.row.accountId || "sem-conta";
		const current = accountSummaryMap.get(key) || {
			account: item.account,
			id: key,
			planned: 0,
			realized: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		accountSummaryMap.set(key, current);
	});
	const accountSummary = Array.from(accountSummaryMap.values())
		.map((item) => ({
			...item,
			deviation: item.realized - item.planned,
			percent: item.planned ? (item.realized / item.planned) * 100 : 0,
		}))
		.sort((left, right) => right.realized - left.realized);
	const centerSummary = centerRows
		.filter(({ center }) => center?.tipoPlano === "A")
		.map((item) => ({ ...item, id: item.center?.id }))
		.sort((left, right) => right.realized - left.realized);
	const supplierSummaryMap = new Map();
	movements.forEach((movement) => {
		const supplier = movementSupplierName(movement);
		const current = supplierSummaryMap.get(supplier) || {
			supplier,
			value: 0,
			rows: 0,
			centers: new Set(),
			accounts: new Set(),
		};
		current.value += movementValue(movement);
		current.rows += 1;
		if (movement.centerId) current.centers.add(movement.centerId);
		if (movement.accountId) current.accounts.add(movement.accountId);
		supplierSummaryMap.set(supplier, current);
	});
	const supplierSummary = Array.from(supplierSummaryMap.values())
		.map((item) => ({
			...item,
			centers: Array.from(item.centers),
			accounts: Array.from(item.accounts),
			share: realizedMonth ? (item.value / realizedMonth) * 100 : 0,
		}))
		.sort((left, right) => right.value - left.value);
	return {
		accounts,
		centers,
		matrix,
		plannedMonth,
		plannedYear,
		realizedMonth,
		committedMonth,
		availableMonth,
		usedPercent,
		idealPercent,
		approvals,
		approvalsAll,
		accountRows,
		centerRows,
		movements,
		monthlyEvolution,
		forecastRows,
		accountSummary,
		centerSummary,
		supplierSummary,
		periodLabel: period.label,
		periodDisplayLabel: period.displayLabel,
	};
}

function budgetAccountLabel(account, fallback = "") {
	if (!account) return fallback;
	return [account.codigo, account.nome].filter(Boolean).join(" - ") || fallback;
}

function budgetCenterCompactLabel(center, fallback = "") {
	if (!center) return fallback;
	return (
		[center.codigo || center.reduzida || center.id, center.nome]
			.filter(Boolean)
			.join(" ") || fallback
	);
}

function isCenterInactive(center) {
	return (
		String(center?.status || "")
			.toLowerCase()
			.includes("inativo") ||
		String(center?.nome || "")
			.toUpperCase()
			.includes("INATIVO")
	);
}

function budgetConsumptionStatus(percent = 0) {
	if (percent > 100) {
		return {
			label: "Estourado",
			textClass: "text-red-600",
			barClass: "bg-red-500",
		};
	}
	if (percent >= 80) {
		return {
			label: "Atenção",
			textClass: "text-amber-600",
			barClass: "bg-amber-400",
		};
	}
	return {
		label: "Positivo",
		textClass: "text-emerald-600",
		barClass: "bg-emerald-500",
	};
}

function budgetVarianceMeta(planned = 0, realized = 0) {
	const variance = Number(planned || 0) - Number(realized || 0);
	const percent = Number(planned || 0)
		? (variance / Number(planned || 0)) * 100
		: 0;
	const favorable = variance >= 0;
	return {
		variance,
		percent,
		favorable,
		textClass: favorable ? "text-emerald-600" : "text-red-600",
	};
}

function budgetApprovalStatusMeta(status = "pendente") {
	const normalized = String(status || "pendente").toLowerCase();
	if (normalized === "aprovado")
		return {
			label: "Aprovado",
			className: "bg-emerald-50 text-emerald-700 border-emerald-200",
		};
	if (normalized === "reprovado")
		return {
			label: "Reprovado",
			className: "bg-red-50 text-red-700 border-red-200",
		};
	if (normalized === "ajuste_solicitado")
		return {
			label: "Ajuste solicitado",
			className: "bg-blue-50 text-blue-700 border-blue-200",
		};
	if (normalized === "expirado")
		return {
			label: "Expirado",
			className: "bg-slate-100 text-slate-600 border-slate-200",
		};
	return {
		label: "Pendente",
		className: "bg-amber-50 text-amber-800 border-amber-200",
	};
}

function normalizeBudgetEmail(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function getCurrentUserBudgetEmail(user = {}) {
	return normalizeBudgetEmail(
		user.email || user.profile?.email || user.user?.email,
	);
}

function isBudgetCenterResponsible(user, center = {}) {
	const userEmail = getCurrentUserBudgetEmail(user);
	return Boolean(
		userEmail && normalizeBudgetEmail(center.emailResponsavel) === userEmail,
	);
}

function BudgetApprovalDecisionModal({ approval, action, onClose, onConfirm }) {
	const [note, setNote] = useState("");
	const isReject = action === "reprovado";
	const isAdjust = action === "ajuste_solicitado";
	const title = isReject
		? "Reprovar aprovação"
		: isAdjust
			? "Solicitar ajuste"
			: "Aprovar solicitação";
	const description = isReject
		? "Informe o motivo da recusa para manter o histórico e preparar o e-mail ao responsável."
		: isAdjust
			? "Descreva o ajuste necessário antes de liberar esta despesa."
			: "Registre uma observação opcional para auditoria.";

	return (
		<ModalShell
			title={title}
			description={description}
			icon={isReject ? <X size={20} /> : <ClipboardCheck size={20} />}
			onClose={onClose}
			size="lg"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={() => onConfirm(note)}
						className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black text-white ${isReject ? "bg-red-600 hover:bg-red-700" : isAdjust ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
					>
						Confirmar
					</button>
				</div>
			}
		>
			<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
				<p className="font-black text-slate-950">
					{approval.center?.nome || approval.centerId}
				</p>
				<p className="mt-1">
					Estouro: {brl.format(approval.overflow || 0)} · Uso:{" "}
					{decimal.format(approval.percent || 0)}%
				</p>
			</div>
			<label className="mt-4 block space-y-2 text-xs font-black uppercase text-slate-500">
				Observação / motivo
				<textarea
					value={note}
					onChange={(event) => setNote(event.target.value)}
					rows={5}
					className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm normal-case font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					placeholder={
						isReject
							? "Ex: Despesa recusada por ultrapassar o orçamento aprovado para o período."
							: "Digite uma observação para auditoria."
					}
				/>
			</label>
		</ModalShell>
	);
}

function BudgetApprovalEmailModal({ approval, onClose, onFakeSend }) {
	const center = approval.center || {};
	const recipient = center.emailResponsavel || "responsavel@empresa.com.br";
	const subject = `Reprovação de despesa - ${center.nome || approval.centerId}`;
	const body = [
		`Olá, ${center.responsavel || "responsável"}.`,
		"",
		`A solicitação vinculada ao centro de custo ${center.nome || approval.centerId} foi reprovada na gestão orçamentária.`,
		"",
		`Orçado: ${brl.format(approval.budgeted || 0)}`,
		`Realizado + comprometido: ${brl.format(approval.used || 0)}`,
		`Estouro: ${brl.format(approval.overflow || 0)}`,
		`Consumo: ${decimal.format(approval.percent || 0)}%`,
		"",
		`Motivo da recusa: ${approval.note || "Não informado."}`,
		"",
		"Por favor, revise o lançamento ou ajuste o orçamento antes de solicitar nova aprovação.",
	].join("\n");

	return (
		<ModalShell
			title="E-mail ao responsável"
			description="Prévia do e-mail de recusa. Nesta fase de testes o envio real está bloqueado."
			icon={<Mail size={20} />}
			onClose={onClose}
			size="2xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Fechar
					</button>
					<button
						type="button"
						onClick={onFakeSend}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
					>
						<Mail size={16} /> Enviar e-mail
					</button>
				</div>
			}
		>
			<div className="grid gap-3 text-sm font-bold text-slate-700">
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
					<span className="font-black text-slate-950">Para:</span> {recipient}
				</div>
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
					<span className="font-black text-slate-950">Assunto:</span> {subject}
				</div>
				<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">
					{body}
				</pre>
			</div>
		</ModalShell>
	);
}

function BudgetCenterPendenciesModal({
	center,
	approvals = [],
	saving,
	onClose,
	onSubmit,
}) {
	const [selectedId, setSelectedId] = useState(approvals[0]?.id || "");
	const [note, setNote] = useState("");
	const selectedApproval =
		approvals.find((approval) => approval.id === selectedId) ||
		approvals[0] ||
		null;

	return (
		<ModalShell
			title="Pendências do centro"
			description="Revise a recusa ou solicitação de ajuste e reenvie para análise do financeiro."
			icon={<AlertTriangle size={20} />}
			onClose={onClose}
			size="xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Fechar
					</button>
					<button
						type="button"
						onClick={() => selectedApproval && onSubmit(selectedApproval, note)}
						disabled={!selectedApproval || saving}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<RefreshCw size={16} />
						)}
						Reenviar ajuste
					</button>
				</div>
			}
		>
			<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
				<p className="text-xs font-black uppercase tracking-wide text-blue-700">
					{center.codigo || center.id}
				</p>
				<h3 className="mt-1 text-lg font-black text-slate-950">
					{center.nome}
				</h3>
				<p className="text-sm font-bold text-slate-500">
					{center.responsavel || "Sem responsável"} ·{" "}
					{center.emailResponsavel || "sem e-mail"}
				</p>
			</div>
			<div className="mt-4 grid gap-3">
				{approvals.map((approval) => {
					const status = budgetApprovalStatusMeta(approval.status);
					const isSelected = approval.id === selectedApproval?.id;
					return (
						<button
							key={approval.id}
							type="button"
							onClick={() => setSelectedId(approval.id)}
							className={`rounded-2xl border p-4 text-left transition ${isSelected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="text-xs font-black uppercase tracking-wide text-slate-500">
									{approval.id}
								</span>
								<span
									className={`rounded-full border px-3 py-1 text-xs font-black ${status.className}`}
								>
									{status.label}
								</span>
							</div>
							<p className="mt-2 text-sm font-black text-slate-950">
								Uso: {decimal.format(approval.percent || 0)}% · Estouro:{" "}
								{brl.format(approval.overflow || 0)}
							</p>
							<p className="mt-1 text-xs font-bold text-slate-600">
								Motivo:{" "}
								{approval.note ||
									approval.reason ||
									"Ajuste solicitado pelo financeiro."}
							</p>
						</button>
					);
				})}
			</div>
			<label className="mt-4 block space-y-2 text-xs font-black uppercase text-slate-500">
				O que foi ajustado?
				<textarea
					value={note}
					onChange={(event) => setNote(event.target.value)}
					rows={5}
					className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm normal-case font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					placeholder="Ex: Revisei o lançamento, anexei justificativa e solicito nova análise."
				/>
			</label>
		</ModalShell>
	);
}

function DreTransactionDrawer({
	row,
	movements = [],
	accountById = new Map(),
	centerById = new Map(),
	onClose,
}) {
	const total = movements.reduce(
		(sum, movement) => sum + movementValue(movement),
		0,
	);
	return (
		<div
			className="fixed inset-0 z-layout-modal flex justify-end bg-slate-950/50 backdrop-blur-sm"
			role="presentation"
		>
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				onClick={onClose}
				aria-label="Fechar extrato"
			/>
			<aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
				<header className="shrink-0 border-b border-slate-100 bg-gradient-to-br from-blue-950 to-blue-700 p-5 text-white">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">
								Extrato da linha
							</p>
							<h2 className="mt-2 text-xl font-black">
								{budgetAccountLabel(row.account, row.row?.accountId)}
							</h2>
							<p className="mt-1 text-sm font-bold text-blue-100">
								{budgetCenterCompactLabel(row.center, row.row?.costCenterId)}
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
							aria-label="Fechar"
						>
							<X size={22} />
						</button>
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-3">
						<div className="rounded-2xl bg-white/10 p-3">
							<p className="text-xs font-bold text-blue-100">Lançamentos</p>
							<p className="text-lg font-black">
								{integer.format(movements.length)}
							</p>
						</div>
						<div className="rounded-2xl bg-white/10 p-3">
							<p className="text-xs font-bold text-blue-100">Total</p>
							<p className="text-lg font-black">{brl.format(total)}</p>
						</div>
						<div className="rounded-2xl bg-white/10 p-3">
							<p className="text-xs font-bold text-blue-100">Orçado</p>
							<p className="text-lg font-black">
								{brl.format(row.planned || 0)}
							</p>
						</div>
					</div>
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					<div className="grid gap-3">
						{movements.length ? (
							movements.map((movement, index) => {
								const account = accountById.get(movement.accountId);
								const center = centerById.get(movement.centerId);
								return (
									<article
										key={movement.id || index}
										className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
									>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="text-sm font-black text-slate-950">
													{movement.supplier || "Fornecedor não informado"}
												</p>
												<p className="mt-1 text-xs font-bold text-slate-500">
													{[movement.year, budgetMonthName(movement.month)]
														.filter(Boolean)
														.join(" - ") || "Sem data"}
												</p>
											</div>
											<p className="text-base font-black text-blue-700">
												{brl.format(movementValue(movement))}
											</p>
										</div>
										<dl className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-2">
											<div className="rounded-xl bg-slate-50 p-2">
												<dt className="text-slate-400">Conta</dt>
												<dd>
													{budgetAccountLabel(
														account,
														movement.accountId || "-",
													)}
												</dd>
											</div>
											<div className="rounded-xl bg-slate-50 p-2">
												<dt className="text-slate-400">Centro</dt>
												<dd>
													{budgetCenterCompactLabel(
														center,
														movement.centerId || "-",
													)}
												</dd>
											</div>
											<div className="rounded-xl bg-slate-50 p-2">
												<dt className="text-slate-400">Título</dt>
												<dd>{movement.titulo || movement.title || "-"}</dd>
											</div>
											<div className="rounded-xl bg-slate-50 p-2">
												<dt className="text-slate-400">Tipo</dt>
												<dd>{movement.tipo || movement.type || "-"}</dd>
											</div>
										</dl>
									</article>
								);
							})
						) : (
							<EmptyState text="Nenhum lançamento individual encontrado para esta linha no período." />
						)}
					</div>
				</div>
			</aside>
		</div>
	);
}

function DreAccountDetailModal({
	group,
	elapsedDays = 1,
	daysInMonth = 31,
	rowStatus,
	sparklineFor,
	onClose,
	onExtract,
	onTransfer,
	onJustify,
}) {
	if (!group) return null;
	return (
		<ModalShell
			title={budgetAccountLabel(group.account, group.id)}
			description={`${integer.format(group.rows.length)} centro(s) de custo vinculados a esta conta financeira.`}
			icon={<FileText size={20} />}
			onClose={onClose}
			size="full"
			bodyClassName="py-3 sm:px-5"
			headerClassName="py-3 sm:px-5"
		>
			<div className="grid gap-3 sm:grid-cols-4">
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
					<p className="text-xs font-black uppercase text-blue-700">Orçado</p>
					<p className="mt-1 text-lg font-black text-slate-950">
						{brl.format(group.planned)}
					</p>
				</div>
				<div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
					<p className="text-xs font-black uppercase text-violet-700">
						Realizado
					</p>
					<p className="mt-1 text-lg font-black text-slate-950">
						{brl.format(group.realized)}
					</p>
				</div>
				<div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
					<p className="text-xs font-black uppercase text-amber-700">
						Comprometido
					</p>
					<p className="mt-1 text-lg font-black text-slate-950">
						{brl.format(group.committed)}
					</p>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
					<p className="text-xs font-black uppercase text-emerald-700">
						Forecast
					</p>
					<p className="mt-1 text-lg font-black text-slate-950">
						{brl.format(
							elapsedDays
								? ((group.realized + group.committed) / elapsedDays) *
										daysInMonth
								: group.realized + group.committed,
						)}
					</p>
				</div>
			</div>
			<div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
				<table className="min-w-[1180px] text-left text-xs font-bold">
					<thead className="bg-slate-50 uppercase text-slate-500">
						<tr>
							<th className="px-3 py-2">Centro</th>
							<th className="px-3 py-2">Status</th>
							<th className="px-3 py-2 text-right">Orçado</th>
							<th className="px-3 py-2 text-right">Realiz.</th>
							<th className="px-3 py-2 text-right">Comp.</th>
							<th className="px-3 py-2 text-right">Forecast</th>
							<th className="px-3 py-2 text-right">Run Rate</th>
							<th className="px-3 py-2 text-right">Desvio</th>
							<th className="px-3 py-2">6 meses</th>
							<th className="px-3 py-2 text-right">Ações</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{group.rows.map((item) => {
							const committed = Number(item.center?.comprometidoMes || 0);
							const used = Number(item.realized || 0) + committed;
							const forecast = elapsedDays
								? (used / elapsedDays) * daysInMonth
								: used;
							const runRate = used / Math.max(1, elapsedDays);
							const variance = budgetVarianceMeta(item.planned, used);
							const status = rowStatus({ ...item, realized: used });
							const sparkline = sparklineFor(item);
							const needsJustification =
								item.planned && used > item.planned * 1.1;
							return (
								<tr key={item.row.id} className="bg-white hover:bg-blue-50/30">
									<td className="px-3 py-2">
										<button
											type="button"
											onClick={() => onExtract(item)}
											className="max-w-[220px] truncate text-left font-black text-slate-900 hover:text-blue-700"
										>
											{budgetCenterCompactLabel(
												item.center,
												item.row.costCenterId,
											)}
										</button>
										<p className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">
											{item.center?.responsavel || "Responsável não informado"}
										</p>
									</td>
									<td className="px-3 py-2">
										<span
											className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-black ring-1 ${status.className}`}
										>
											<span
												className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
											/>{" "}
											{status.label}
										</span>
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{brl.format(item.planned)}
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{brl.format(item.realized)}
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{brl.format(committed)}
									</td>
									<td
										className={`px-3 py-2 text-right font-black ${forecast > item.planned ? "text-red-600" : "text-emerald-600"}`}
									>
										{brl.format(forecast)}
									</td>
									<td className="px-3 py-2 text-right text-slate-700">
										{brl.format(runRate)}
									</td>
									<td
										className={`px-3 py-2 text-right font-black ${variance.textClass}`}
									>
										{brl.format(variance.variance)}
										<br />
										<span className="text-[10px]">
											{decimal.format(variance.percent)}%
										</span>
									</td>
									<td className="px-3 py-2">
										<div className="flex h-9 items-end gap-1">
											{sparkline.map((bar) => (
												<span
													key={bar.index}
													title={brl.format(bar.value)}
													className="w-2 rounded-t bg-gradient-to-t from-blue-600 to-cyan-300"
													style={{ height: `${bar.height}px` }}
												/>
											))}
										</div>
									</td>
									<td className="px-3 py-2">
										<div className="flex justify-end gap-1.5">
											<button
												type="button"
												onClick={() => onExtract(item)}
												className="rounded-lg border border-blue-200 px-2 py-1.5 text-[11px] font-black text-blue-700 hover:bg-blue-50"
											>
												Extrato
											</button>
											<button
												type="button"
												onClick={() => onTransfer(item)}
												className="rounded-lg border border-emerald-200 px-2 py-1.5 text-[11px] font-black text-emerald-700 hover:bg-emerald-50"
											>
												Verba
											</button>
											{needsJustification ? (
												<button
													type="button"
													onClick={() => onJustify(item)}
													className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100"
												>
													Justificar
												</button>
											) : null}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</ModalShell>
	);
}

function BudgetTransferRequestModal({ row, onClose }) {
	const [amount, setAmount] = useState("");
	const [fromAccount, setFromAccount] = useState("");
	const [reason, setReason] = useState("");
	return (
		<ModalShell
			title="Solicitar transferência de verba"
			description="Registre uma solicitação para mover saldo de uma conta com folga para cobrir déficit desta linha."
			icon={<Repeat2 size={20} />}
			onClose={onClose}
			size="2xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
					>
						Registrar solicitação
					</button>
				</div>
			}
		>
			<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
				<p className="text-xs font-black uppercase text-emerald-700">Destino</p>
				<p className="mt-1 text-base font-black text-slate-950">
					{budgetAccountLabel(row.account, row.row?.accountId)}
				</p>
				<p className="text-sm font-bold text-slate-600">
					{budgetCenterCompactLabel(row.center, row.row?.costCenterId)}
				</p>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Conta origem com folga
					<input
						value={fromAccount}
						onChange={(event) => setFromAccount(event.target.value)}
						className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
						placeholder="Ex: Financeiro"
					/>
				</label>
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Valor
					<input
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
						placeholder="R$ 0,00"
					/>
				</label>
			</div>
			<label className="mt-4 block space-y-2 text-xs font-black uppercase text-slate-500">
				Justificativa
				<textarea
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					rows={4}
					className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
					placeholder="Explique o motivo da transferência."
				/>
			</label>
		</ModalShell>
	);
}

function BudgetDeviationJustificationModal({ row, onClose }) {
	const [text, setText] = useState("");
	return (
		<ModalShell
			title="Justificativa de desvio"
			description="Contas com desvio acima do limite tolerável precisam de uma justificativa para auditoria."
			icon={<AlertTriangle size={20} />}
			onClose={onClose}
			size="2xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={onClose}
						disabled={!text.trim()}
						className="inline-flex min-h-11 items-center rounded-xl bg-amber-500 px-4 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
					>
						Salvar justificativa
					</button>
				</div>
			}
		>
			<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
				<p className="text-xs font-black uppercase text-amber-700">
					Linha em alerta
				</p>
				<p className="mt-1 text-base font-black text-slate-950">
					{budgetAccountLabel(row.account, row.row?.accountId)}
				</p>
				<p className="text-sm font-bold text-slate-600">
					{budgetCenterCompactLabel(row.center, row.row?.costCenterId)}
				</p>
			</div>
			<label className="mt-4 block space-y-2 text-xs font-black uppercase text-slate-500">
				Justificativa obrigatória
				<textarea
					value={text}
					onChange={(event) => setText(event.target.value)}
					rows={6}
					className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
					placeholder="Ex: aumento pontual por ajuste de contrato, cobrança retroativa ou fatura represada."
				/>
			</label>
		</ModalShell>
	);
}

function BudgetOperationalPage({
	page,
	config,
	loading,
	canManage,
	onConfigUpdated,
	onOpenDirectoratesConfig,
	selectedPeriod,
}) {
	const insights = useMemo(
		() => getBudgetInsightsFromStatement(config, selectedPeriod),
		[config, selectedPeriod],
	);
	const {
		currentUser,
		modalState,
		setModalState,
		approvalDecision,
		setApprovalDecision,
		approvalEmail,
		setApprovalEmail,
		approvalListDetail,
		setApprovalListDetail,
		pendenciesState,
		setPendenciesState,
		analyticChildrenModal,
		setAnalyticChildrenModal,
		dashboardDetail,
		setDashboardDetail,
		dashboardDetailPage,
		setDashboardDetailPage,
		centerPage,
		setCenterPage,
		dreAccountDetail,
		setDreAccountDetail,
		dreDrawer,
		setDreDrawer,
		transferRequest,
		setTransferRequest,
		deviationJustification,
		setDeviationJustification,
		saving,
		feedback,
		setFeedback,
		upsertOperationalCenter,
		removeOperationalCenter,
		updateApprovalStatus,
		resendApprovalAdjustment,
	} = useBudgetOperationalActions({
		config,
		onConfigUpdated,
		getVisibleError,
	});
	if (loading) {
		return (
			<section className="grid gap-4 md:grid-cols-5">
				{Array.from({ length: 5 }, (_, index) => (
					<FinancialKpiCard
						key={index}
						item={{ title: "Carregando", value: 0, icon: "BadgeDollarSign" }}
						loading
					/>
				))}
			</section>
		);
	}

	const hasData =
		insights.accounts.length ||
		insights.centers.length ||
		insights.matrix.length;
	if (!hasData) {
		return (
			<section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">
					Gestão Orçamento pronta para receber dados
				</h2>
				<p className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-blue-900">
					Cadastre plano de contas, centros de custo e matriz anual em
					Financeiro &gt; Gestão Orçamento &gt; Configurações. As páginas passam
					a calcular dashboard, realizado, desvios e aprovações automaticamente
					com base nesses cadastros.
				</p>
				<Link
					to={ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES}
					className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
				>
					Ir para configurações
				</Link>
			</section>
		);
	}

	const expiringContracts = 0;
	const kpis = buildBudgetOperationalKpis(insights, config);
	const costCenterTopCards = buildCostCenterTopCards({
		insights,
		config,
		selectedPeriod,
		expiringContracts,
	});
	const responsibleOnly = !canManage;
	const {
		rowByCenterId,
		allRowByCenterId,
		operationalCenterGroups,
		metricForCenter,
	} = buildOperationalCenterGroups({
		config,
		insights,
		currentUser,
		responsibleOnly,
	});
	const centerPageSize = 12;
	const {
		totalPages: centerTotalPages,
		safePage: safeCenterPage,
		rows: paginatedOperationalGroups,
	} = paginateBudgetGroups(operationalCenterGroups, centerPage, centerPageSize);

	if (responsibleOnly && page !== "orcamentoCentrosCusto") {
		return (
			<section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">
					Acesso limitado aos seus centros de custo
				</h2>
				<p className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-blue-900">
					Seu usuário pode acompanhar apenas os centros de custo vinculados ao
					seu e-mail e reenviar pendências solicitadas pelo financeiro.
				</p>
				<Link
					to={ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO}
					className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
				>
					Ir para centros de custo
				</Link>
			</section>
		);
	}

	const BudgetPageView = BUDGET_OPERATIONAL_PAGE_VIEWS[page];

	if (BudgetPageView) {
		return (
			<BudgetPageView
				BudgetApprovalDecisionModal={BudgetApprovalDecisionModal}
				BudgetApprovalEmailModal={BudgetApprovalEmailModal}
				BudgetCenterPendenciesModal={BudgetCenterPendenciesModal}
				BudgetDeviationJustificationModal={BudgetDeviationJustificationModal}
				BudgetTransferRequestModal={BudgetTransferRequestModal}
				CostCenterAnalyticChildrenModal={CostCenterAnalyticChildrenModal}
				CostCenterModal={CostCenterModal}
				DreAccountDetailModal={DreAccountDetailModal}
				DreTransactionDrawer={DreTransactionDrawer}
				EmptyState={EmptyState}
				FeedbackModal={FeedbackModal}
				allRowByCenterId={allRowByCenterId}
				analyticChildrenModal={analyticChildrenModal}
				approvalDecision={approvalDecision}
				approvalEmail={approvalEmail}
				approvalListDetail={approvalListDetail}
				brl={brl}
				budgetAccountLabel={budgetAccountLabel}
				budgetApprovalStatusMeta={budgetApprovalStatusMeta}
				budgetCenterCompactLabel={budgetCenterCompactLabel}
				budgetConsumptionStatus={budgetConsumptionStatus}
				budgetVarianceMeta={budgetVarianceMeta}
				buildBudgetPeriod={buildBudgetPeriod}
				canManage={canManage}
				centerPage={centerPage}
				centerTotalPages={centerTotalPages}
				config={config}
				costCenterTopCards={costCenterTopCards}
				currentUser={currentUser}
				decimal={decimal}
				deviationJustification={deviationJustification}
				dreAccountDetail={dreAccountDetail}
				dreDrawer={dreDrawer}
				feedback={feedback}
				findDirectorateByName={findDirectorateByName}
				getBudgetSettings={getBudgetSettings}
				insights={insights}
				integer={integer}
				isBudgetCenterResponsible={isBudgetCenterResponsible}
				isCenterInactive={isCenterInactive}
				metricForCenter={metricForCenter}
				modalState={modalState}
				movementValue={movementValue}
				operationalCenterGroups={operationalCenterGroups}
				paginatedOperationalGroups={paginatedOperationalGroups}
				pendenciesState={pendenciesState}
				removeOperationalCenter={removeOperationalCenter}
				resendApprovalAdjustment={resendApprovalAdjustment}
				responsibleOnly={responsibleOnly}
				rowByCenterId={rowByCenterId}
				safeCenterPage={safeCenterPage}
				saving={saving}
				selectedPeriod={selectedPeriod}
				setAnalyticChildrenModal={setAnalyticChildrenModal}
				setApprovalDecision={setApprovalDecision}
				setApprovalEmail={setApprovalEmail}
				setApprovalListDetail={setApprovalListDetail}
				setCenterPage={setCenterPage}
				setDeviationJustification={setDeviationJustification}
				setDreAccountDetail={setDreAccountDetail}
				setDreDrawer={setDreDrawer}
				setFeedback={setFeedback}
				setModalState={setModalState}
				setPendenciesState={setPendenciesState}
				setTransferRequest={setTransferRequest}
				transferRequest={transferRequest}
				updateApprovalStatus={updateApprovalStatus}
				upsertOperationalCenter={upsertOperationalCenter}
			/>
		);
	}

	const pareto = findBudgetParetoRows(insights, 8);
	const accountById = new Map(
		(config.accounts || []).map((account) => [account.id, account]),
	);
	const centerById = new Map(
		(config.centers || []).map((center) => [center.id, center]),
	);
	const companyById = new Map(
		(config.companies || []).map((company) => [company.id, company]),
	);
	const branchById = new Map(
		(config.branches || []).map((branch) => [branch.id, branch]),
	);
	const monthlyChart = buildBudgetMonthlyChart(insights);
	const forecastChart = buildBudgetForecastChart(insights);
	const { rows: topAccounts, chart: accountChart } = buildBudgetAccountChart(
		insights.accountSummary,
		budgetAccountLabel,
		8,
	);
	const waterfallRows = topAccounts.slice(0, 6);
	const { rows: topCenters, chart: centerChart } = buildBudgetCenterChart(
		insights.centerSummary,
		budgetCenterCompactLabel,
		8,
	);
	const treemapItems = topCenters.slice(0, 12);
	const {
		rows: topSuppliers,
		total: supplierTotalTop,
		chart: supplierChart,
	} = buildBudgetSupplierChart(insights.supplierSummary, 10);
	const directorateRows = buildDirectorateRows(insights, config);
	const directorateTopRows = directorateRows.slice(0, 4);
	const fullAccountChart = buildBudgetAccountChart(
		insights.accountSummary,
		budgetAccountLabel,
		Infinity,
	).chart;
	const fullCenterChart = buildBudgetCenterChart(
		insights.centerSummary,
		budgetCenterCompactLabel,
		Infinity,
	).chart;
	const fullSupplierChart = buildBudgetFullSupplierChart(
		insights.supplierSummary,
	);
	const fullPareto = findBudgetParetoRows(insights, Infinity);
	const fullTreemapItems = insights.centerSummary;
	const detailTitles = {
		ritmo: "Ritmo de consumo completo",
		viloes: "Todos os centros analíticos por consumo",
		mensal: "Orçado x realizado mensal completo",
		forecast: "Tendência e forecast completo",
		cascata: "Cascata completa por conta financeira",
		contas: "Todas as contas financeiras",
		centros: "Todos os centros de custo analíticos",
		treemap: "Treemap completo de centros de custo",
		fornecedores: "Concentração completa por fornecedor",
		diretorias: "Ranking completo por diretoria",
		movimentacoes: "Todas as movimentações do período",
	};
	const detailChartHeight = (rows, min = 360) =>
		Math.max(min, Math.min(1200, Number(rows || 0) * 34));
	const supplierChartHeight = (rows) =>
		Math.max(520, Math.min(4200, Number(rows || 0) * 44));
	const renderDashboardDetail = () => {
		if (!dashboardDetail) return null;
		const DetailComponent = getBudgetDashboardDetailRenderer(dashboardDetail);
		if (!DetailComponent) return null;
		return (
			<DetailComponent
				EmptyState={EmptyState}
				accountById={accountById}
				barOptions={barOptions}
				branchById={branchById}
				budgetAccountLabel={budgetAccountLabel}
				budgetCenterCompactLabel={budgetCenterCompactLabel}
				budgetConsumptionStatus={budgetConsumptionStatus}
				centerById={centerById}
				companyById={companyById}
				dashboardDetailPage={dashboardDetailPage}
				detailChartHeight={detailChartHeight}
				directorateRows={directorateRows}
				forecastChart={forecastChart}
				fullAccountChart={fullAccountChart}
				fullCenterChart={fullCenterChart}
				fullPareto={fullPareto}
				fullSupplierChart={fullSupplierChart}
				fullTreemapItems={fullTreemapItems}
				insights={insights}
				lineOptions={lineOptions}
				monthlyChart={monthlyChart}
				renderMovementsDetailTable={renderMovementsDetailTable}
				renderSupplierDetailTable={renderSupplierDetailTable}
				setDashboardDetailPage={setDashboardDetailPage}
				smartCurrencyStep={smartCurrencyStep}
				supplierBarOptions={supplierBarOptions}
				supplierChartHeight={supplierChartHeight}
			/>
		);
	};
	return (
		<>
		<BudgetDashboardView
			ChartCard={ChartCard}
			EmptyState={EmptyState}
			FinancePanel={FinancePanel}
			PanelActionButton={PanelActionButton}
			accountById={accountById}
			accountChart={accountChart}
			barOptions={barOptions}
			branchById={branchById}
			brl={brl}
			budgetAccountLabel={budgetAccountLabel}
			budgetCenterCompactLabel={budgetCenterCompactLabel}
			budgetConsumptionStatus={budgetConsumptionStatus}
			centerById={centerById}
			centerChart={centerChart}
			companyById={companyById}
			dashboardDetail={dashboardDetail}
			decimal={decimal}
			detailTitles={detailTitles}
			directorateTopRows={directorateTopRows}
			forecastChart={forecastChart}
			insights={insights}
			integer={integer}
			kpis={kpis}
			lineOptions={lineOptions}
			monthlyChart={monthlyChart}
			movementSupplierName={movementSupplierName}
			movementValue={movementValue}
			onCloseDashboardDetail={() => setDashboardDetail(null)}
			onOpenDirectoratesConfig={onOpenDirectoratesConfig}
			onShowDashboardDetail={setDashboardDetail}
			pareto={pareto}
			renderDashboardDetail={renderDashboardDetail}
			supplierChart={supplierChart}
			supplierTotalTop={supplierTotalTop}
			topAccounts={topAccounts}
			topCenters={topCenters}
			topSuppliers={topSuppliers}
			treemapItems={treemapItems}
			waterfallRows={waterfallRows}
		/>
		</>
	);
}

const EMPTY_COST_CENTER = {
	id: "",
	codigo: "",
	nome: "",
	parentId: "",
	tipoCentro: "departamento",
	companies: [],
	branches: [],
	contasFinanceiras: [],
	contaFinanceiraPadrao: "",
	responsavel: "",
	telefoneResponsavel: "",
	emailResponsavel: "",
	tipoDespesa: "opex",
	categoriaPrincipal: "",
	diretoria: "",
	contaContabil: "",
	valorMensal: "",
	valorAnual: "",
	comprometidoMes: "",
	realizadoMes: "",
	alertaPercentual: 85,
	prioridade: "normal",
	status: "ativo",
	finalidade: "",
	observacoes: "",
};

const EMPTY_BUDGET_COMPANY = {
	id: "",
	codigo: "",
	nome: "",
	nomeFantasia: "",
	razaoSocial: "",
	cidade: "",
	cnpj: "",
	filialId: "",
	filiais: [],
	responsavel: "",
	telefoneResponsavel: "",
	emailResponsavel: "",
	status: "ativo",
	observacoes: "",
};

const EMPTY_BUDGET_BRANCH = {
	id: "",
	codigo: "",
	empresaId: "",
	nome: "",
	nomeFantasia: "",
	razaoSocial: "",
	cidade: "",
	cnpj: "",
	estado: "",
	responsavel: "",
	telefoneResponsavel: "",
	emailResponsavel: "",
	status: "ativo",
	observacoes: "",
};

const EMPTY_BUDGET_PARTNER = {
	id: "",
	codigo: "",
	nome: "",
	razaoSocial: "",
	cnpj: "",
	tipo: "fornecedor",
	contaPadraoId: "",
	centroCustoPadraoId: "",
	centrosCusto: [],
	empresas: [],
	filiais: [],
	email: "",
	telefone: "",
	status: "ativo",
	observacoes: "",
};

const EMPTY_FINANCIAL_ACCOUNT = {
	id: "",
	codigo: "",
	nome: "",
	parentId: "",
	tipo: "despesa",
	natureza: "opex",
	grupo: "",
	categoriaMae: "",
	categoriaClasse: BUDGET_CATEGORY_CLASSES.BASAL,
	dreGroup: "",
	contaContabil: "",
	status: "ativo",
	descricao: "",
};

const BUDGET_MONTHS = [
	"Jan",
	"Fev",
	"Mar",
	"Abr",
	"Mai",
	"Jun",
	"Jul",
	"Ago",
	"Set",
	"Out",
	"Nov",
	"Dez",
];

const COST_CENTER_TYPES = {
	capex: "CAPEX",
	opex: "OPEX",
	misto: "CAPEX/OPEX",
};

const DEFAULT_BUDGET_SETTINGS = {
	centerTypes: ["sintetico", "analitico"],
	mainCategories: [
		"11 - DEPARTAMENTO",
		"12 - INATIVO - DEPARTAMENTO ADMINISTRATIVO",
		"13 - INATIVO - DEPARTAMENTO COMERCIAL",
		"14 - INATIVO - DEPARTAMENTO EXPERIENCIA DO CLIENTE",
		"15 - INATIVO - DEPARTAMENTO DSO",
		"16 - INATIVO - DEPARTAMENTO FINANCEIRO",
		"17 - INATIVO - DEPARTAMENTO PESSOAL",
		"18 - INATIVO - DEPARTAMENTO SIS/TD",
		"19 - INATIVO - DEPARTAMENTO T.I",
		"21 - Lancamentos reclassificar - INATIVAR",
		"22 - PROJETOS",
	],
	directorates: [],
	accountGroups: [
		"11 - RECEITAS",
		"12 - CUSTOS",
		"13 - DESPESAS",
		"14 - IMPOSTOS",
		"15 - DISTRIBUIÇÃO",
		"16 - CONTA TRANSITÓRIA",
		"17 - DEDUÇÕES",
		"18 - AÇÕES",
	],
	dreGroups: [
		"Receita Bruta",
		"Despesas administrativas",
		"Despesas operacionais",
		"CAPEX",
		"Impostos",
	],
	centerStatuses: ["ativo", "em_observacao", "bloqueado", "inativo"],
	financialAccountCategories: normalizeFinancialAccountCategories(
		FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
	),
};

const EMPTY_DIRECTORATE = {
	id: "",
	nome: "",
	diretor: "",
	emailDiretor: "",
	numeroDiretor: "",
};

function normalizeList(value, fallback = []) {
	if (value === undefined || value === null) return fallback;
	const rawSource = Array.isArray(value)
		? value
		: String(value || "").split(/[,;\n]+/);
	const source = rawSource.flatMap((item) =>
		String(item || "")
			.replace(
				/(respons[áa]vel|financeiro|operacional|administrativo|comercial|t[.\s-]*i|tiago|diretor[a-z\s]*)\s*(?=Diretoria\s)/gi,
				"$1\n",
			)
			.split(/\n+/),
	);
	const normalized = source
		.map((item) => String(item || "").trim())
		.filter(Boolean);
	return [...new Set(normalized)];
}

function parseLegacyDirectorate(value = "") {
	const text = String(value || "").trim();
	if (!text || text.toLowerCase() === "[object object]")
		return { nome: "", diretor: "", emailDiretor: "", numeroDiretor: "" };
	const [nome = "", diretor = "", emailDiretor = "", numeroDiretor = ""] = text
		.split("|")
		.map((item) => item.trim());
	return { nome, diretor, emailDiretor, numeroDiretor };
}

function normalizeDirectorates(value, fallback = []) {
	const source = value === undefined || value === null ? fallback : value;
	const rawItems = Array.isArray(source)
		? source
		: String(source || "").split(/[,;\n]+/);
	const seen = new Set();
	return rawItems
		.map((item) => {
			const parsed =
				typeof item === "object" && item !== null
					? {
							id: String(item.id || item.nome || item.name || "").trim(),
							nome: String(
								item.nome || item.name || item.diretoria || "",
							).trim(),
							diretor: String(
								item.diretor || item.director || item.responsavel || "",
							).trim(),
							emailDiretor: String(
								item.emailDiretor || item.directorEmail || item.email || "",
							).trim(),
							numeroDiretor: String(
								item.numeroDiretor ||
									item.telefoneDiretor ||
									item.directorPhone ||
									item.telefone ||
									item.numero ||
									"",
							).trim(),
						}
					: parseLegacyDirectorate(item);
			const nome = String(parsed.nome || "").trim();
			if (!nome || nome.toLowerCase() === "[object object]") return null;
			const id = budgetEntityId(parsed.id || nome, `diretoria-${nome}`);
			return {
				id,
				nome,
				diretor: String(parsed.diretor || "").trim(),
				emailDiretor: String(parsed.emailDiretor || "").trim(),
				numeroDiretor: String(parsed.numeroDiretor || "").trim(),
			};
		})
		.filter(Boolean)
		.filter((item) => {
			const key = normalizeImportHeader(item.nome);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function findDirectorateByName(directorates = [], name = "") {
	const key = normalizeImportHeader(name);
	return (
		normalizeDirectorates(directorates).find(
			(item) => normalizeImportHeader(item.nome) === key,
		) || null
	);
}

function getBudgetSettings(settings = {}) {
	return {
		centerTypes: normalizeList(
			settings.centerTypes,
			DEFAULT_BUDGET_SETTINGS.centerTypes,
		),
		mainCategories: normalizeList(
			settings.mainCategories,
			DEFAULT_BUDGET_SETTINGS.mainCategories,
		),
		directorates: normalizeDirectorates(
			settings.directorates,
			DEFAULT_BUDGET_SETTINGS.directorates,
		),
		accountGroups: normalizeList(
			settings.accountGroups,
			DEFAULT_BUDGET_SETTINGS.accountGroups,
		),
		dreGroups: normalizeList(
			settings.dreGroups,
			DEFAULT_BUDGET_SETTINGS.dreGroups,
		),
		centerStatuses: normalizeList(
			settings.centerStatuses,
			DEFAULT_BUDGET_SETTINGS.centerStatuses,
		),
		financialAccountCategories: normalizeFinancialAccountCategories(
			settings.financialAccountCategories,
			DEFAULT_BUDGET_SETTINGS.financialAccountCategories,
		),
		financialCategoryBudgets: Array.isArray(settings.financialCategoryBudgets)
			? settings.financialCategoryBudgets.filter(
					(item) => item && typeof item === "object",
				)
			: [],
	};
}

function formatOptionLabel(value) {
	return String(value || "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function budgetEntityId(value, fallback = "item") {
	return (
		String(value || "")
			.trim()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || fallback
	);
}

function MoneyInput({ value, disabled, onChange }) {
	return (
		<div className="mt-2 flex overflow-hidden rounded-xl border border-emerald-200 bg-white ring-0 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-100">
			<span className="flex min-h-11 items-center bg-emerald-50 px-3 text-sm font-black text-emerald-800">
				R$
			</span>
			<input
				value={value ?? ""}
				disabled={disabled}
				inputMode="decimal"
				onChange={onChange}
				placeholder="0,00"
				className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-left text-sm font-bold tabular-nums text-slate-950 outline-none"
			/>
		</div>
	);
}

function ListConfigInput({ label, value = [], onChange, disabled, helper }) {
	const [draft, setDraft] = useState("");
	const items = normalizeList(value, []);

	const addItem = () => {
		const nextItem = String(draft || "").trim();
		if (!nextItem) return;
		onChange([...new Set([...items, nextItem])]);
		setDraft("");
	};

	const removeItem = (itemToRemove) => {
		onChange(items.filter((item) => item !== itemToRemove));
	};

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						{label}
					</p>
					{helper ? (
						<p className="mt-1 text-xs font-bold normal-case text-slate-400">
							{helper}
						</p>
					) : null}
				</div>
				<span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
					{items.length}
				</span>
			</div>
			<div className="mt-2 flex gap-2">
				<input
					value={draft}
					disabled={disabled}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addItem();
						}
					}}
					placeholder="Digite e adicione"
					className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
				/>
				<button
					type="button"
					disabled={disabled || !String(draft || "").trim()}
					onClick={addItem}
					className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-black normal-case text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Plus size={16} />
					Adicionar e salvar
				</button>
			</div>
			{items.length ? (
				<div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
					{items.map((item) => (
						<span
							key={item}
							className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black normal-case text-blue-700"
						>
							<span className="truncate">{item}</span>
							<button
								type="button"
								disabled={disabled}
								onClick={() => removeItem(item)}
								className="rounded-full text-blue-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
								aria-label={`Remover ${item}`}
							>
								<X size={13} />
							</button>
						</span>
					))}
				</div>
			) : (
				<div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold normal-case text-slate-400">
					Nenhum item cadastrado.
				</div>
			)}
		</div>
	);
}

function DirectoratesDropdownSection({
	value = [],
	centers = [],
	onChange,
	disabled,
}) {
	const [form, setForm] = useState(EMPTY_DIRECTORATE);
	const [viewDirectorate, setViewDirectorate] = useState(null);
	const directorates = normalizeDirectorates(value);
	const update = (field, nextValue) =>
		setForm((current) => ({ ...current, [field]: nextValue }));
	const resetForm = () => setForm(EMPTY_DIRECTORATE);
	const isEditing = Boolean(form.id);

	const saveDirectorate = () => {
		const normalized = normalizeDirectorates([form])[0];
		if (!normalized) return;
		const next = directorates.some(
			(item) =>
				item.id === normalized.id ||
				normalizeImportHeader(item.nome) ===
					normalizeImportHeader(normalized.nome),
		)
			? directorates.map((item) =>
					item.id === normalized.id ||
					normalizeImportHeader(item.nome) ===
						normalizeImportHeader(normalized.nome)
						? normalized
						: item,
				)
			: [...directorates, normalized];
		onChange(next);
		resetForm();
	};

	const removeDirectorate = (directorate) => {
		onChange(directorates.filter((item) => item.id !== directorate.id));
		if (form.id === directorate.id) resetForm();
	};

	const metricsForDirectorate = (directorate) => {
		const linkedCenters = (centers || []).filter(
			(center) =>
				normalizeImportHeader(center.diretoria) ===
				normalizeImportHeader(directorate.nome),
		);
		const synthetics = linkedCenters.filter(
			(center) => center.tipoPlano === "S",
		);
		const analytics = linkedCenters.filter(
			(center) => center.tipoPlano === "A",
		);
		const budgetSource = analytics.length
			? analytics
			: linkedCenters.filter((center) => center.tipoPlano !== "S");
		const realizedSource = analytics.length
			? analytics
			: linkedCenters.filter((center) => center.tipoPlano !== "S");
		const budget = budgetSource.reduce(
			(sum, center) =>
				sum + Number(center.valorMensal || center.orcamentoMensal || 0),
			0,
		);
		const realized = realizedSource.reduce(
			(sum, center) =>
				sum + Number(center.realizadoImportado || center.realizadoMes || 0),
			0,
		);
		const used = budget ? (realized / budget) * 100 : 0;
		return { linkedCenters, synthetics, analytics, budget, realized, used };
	};

	const viewMetrics = viewDirectorate
		? metricsForDirectorate(viewDirectorate)
		: null;

	return (
		<>
			<BudgetDropdownSection
				title="Diretorias"
				count={directorates.length}
				className="mt-5 border-indigo-200 bg-indigo-50"
				open={false}
				action={
					<div className="grid w-full gap-3 rounded-2xl border border-indigo-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
						<label className="text-xs font-black uppercase text-slate-500">
							Nome diretoria
							<input
								value={form.nome}
								disabled={disabled}
								onChange={(event) => update("nome", event.target.value)}
								className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
							/>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Diretor
							<input
								value={form.diretor}
								disabled={disabled}
								onChange={(event) => update("diretor", event.target.value)}
								className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
							/>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							E-mail diretor
							<input
								type="email"
								value={form.emailDiretor}
								disabled={disabled}
								onChange={(event) => update("emailDiretor", event.target.value)}
								className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
							/>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Número diretor
							<input
								value={form.numeroDiretor}
								disabled={disabled}
								onChange={(event) =>
									update("numeroDiretor", event.target.value)
								}
								className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
							/>
						</label>
						<div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
							<button
								type="button"
								onClick={saveDirectorate}
								disabled={disabled || !String(form.nome || "").trim()}
								className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
							>
								<Plus size={14} />{" "}
								{isEditing ? "Salvar diretoria" : "Adicionar diretoria"}
							</button>
							{isEditing ? (
								<button
									type="button"
									onClick={resetForm}
									disabled={disabled}
									className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								>
									Cancelar edição
								</button>
							) : null}
						</div>
					</div>
				}
			>
				{directorates.length ? (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{directorates.map((directorate) => {
							const metrics = metricsForDirectorate(directorate);
							return (
								<article
									key={directorate.id}
									className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-xs font-black uppercase tracking-wide text-indigo-700">
												{directorate.nome}
											</p>
											<h3
												className="mt-1 truncate text-base font-black text-slate-950"
												title={directorate.diretor || ""}
											>
												{directorate.diretor || "Diretor não informado"}
											</h3>
											<p
												className="mt-1 truncate text-xs font-bold text-slate-500"
												title={directorate.emailDiretor || ""}
											>
												{directorate.emailDiretor || "E-mail não informado"}
											</p>
											<p className="mt-1 text-xs font-bold text-slate-500">
												{directorate.numeroDiretor || "Número não informado"}
											</p>
										</div>
										<span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">
											{integer.format(metrics.synthetics.length)} sint.
										</span>
									</div>
									<div className="mt-4 grid grid-cols-2 gap-3 text-xs">
										<div className="rounded-xl bg-slate-50 p-3">
											<p className="font-bold text-slate-500">Centros</p>
											<p className="font-black text-slate-950">
												{integer.format(metrics.synthetics.length)} sint. ·{" "}
												{integer.format(metrics.analytics.length)} anal.
											</p>
										</div>
										<div className="rounded-xl bg-slate-50 p-3">
											<p className="font-bold text-slate-500">Uso</p>
											<p className="font-black text-slate-950">
												{decimal.format(metrics.used)}%
											</p>
										</div>
										<div className="rounded-xl bg-slate-50 p-3">
											<p className="font-bold text-slate-500">
												Orçamento mensal
											</p>
											<p className="font-black text-slate-950">
												{brl.format(metrics.budget)}
											</p>
										</div>
										<div className="rounded-xl bg-slate-50 p-3">
											<p className="font-bold text-slate-500">Utilizado</p>
											<p className="font-black text-slate-950">
												{brl.format(metrics.realized)}
											</p>
										</div>
									</div>
									<div className="mt-3 flex flex-wrap gap-2">
										{metrics.linkedCenters.slice(0, 4).map((center) => (
											<span
												key={center.id}
												className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
											>
												{center.codigo || center.id} · {center.nome}
											</span>
										))}
										{metrics.linkedCenters.length > 4 ? (
											<span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
												+{metrics.linkedCenters.length - 4}
											</span>
										) : null}
									</div>
									<div className="mt-4 flex flex-wrap gap-2">
										<button
											type="button"
											onClick={() => setViewDirectorate(directorate)}
											className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-indigo-200 px-3 text-xs font-black text-indigo-700 hover:bg-indigo-50"
										>
											<Eye size={14} /> Ver centros
										</button>
										<button
											type="button"
											onClick={() => setForm(directorate)}
											disabled={disabled}
											className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
										>
											<Pencil size={14} /> Editar
										</button>
										<button
											type="button"
											onClick={() => removeDirectorate(directorate)}
											disabled={disabled}
											className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
										>
											<Trash2 size={14} /> Excluir
										</button>
									</div>
								</article>
							);
						})}
					</div>
				) : (
					<p className="rounded-xl border border-dashed border-indigo-200 bg-white/70 p-4 text-sm font-bold text-slate-500">
						Nenhuma diretoria cadastrada.
					</p>
				)}
			</BudgetDropdownSection>
			{viewDirectorate ? (
				<ModalShell
					title={`Centros de ${viewDirectorate.nome}`}
					description={`${viewDirectorate.diretor || "Diretor não informado"} · ${integer.format(viewMetrics?.linkedCenters.length || 0)} centro(s) vinculado(s)`}
					onClose={() => setViewDirectorate(null)}
					size="4xl"
				>
					<div className="grid gap-3 md:grid-cols-4">
						<div className="rounded-2xl bg-indigo-50 p-4">
							<p className="text-xs font-black uppercase text-indigo-700">
								Sintéticos
							</p>
							<p className="mt-1 text-xl font-black text-indigo-950">
								{integer.format(viewMetrics?.synthetics.length || 0)}
							</p>
						</div>
						<div className="rounded-2xl bg-blue-50 p-4">
							<p className="text-xs font-black uppercase text-blue-700">
								Analíticos
							</p>
							<p className="mt-1 text-xl font-black text-blue-950">
								{integer.format(viewMetrics?.analytics.length || 0)}
							</p>
						</div>
						<div className="rounded-2xl bg-emerald-50 p-4">
							<p className="text-xs font-black uppercase text-emerald-700">
								Orçamento mensal
							</p>
							<p className="mt-1 text-xl font-black text-emerald-950">
								{brl.format(viewMetrics?.budget || 0)}
							</p>
						</div>
						<div className="rounded-2xl bg-amber-50 p-4">
							<p className="text-xs font-black uppercase text-amber-700">
								Utilizado
							</p>
							<p className="mt-1 text-xl font-black text-amber-950">
								{brl.format(viewMetrics?.realized || 0)}
							</p>
						</div>
					</div>
					<div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-white">
						<table className="min-w-full divide-y divide-slate-100 text-sm">
							<thead className="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
								<tr>
									<th className="px-4 py-3">Centro</th>
									<th className="px-4 py-3">Tipo</th>
									<th className="px-4 py-3">Responsável</th>
									<th className="px-4 py-3 text-right">Mensal</th>
									<th className="px-4 py-3 text-right">Realizado</th>
									<th className="px-4 py-3 text-right">Uso</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{(viewMetrics?.linkedCenters || []).map((center) => {
									const monthly = Number(
										center.tipoPlano === "S"
											? 0
											: center.valorMensal || center.orcamentoMensal || 0,
									);
									const realized = Number(
										center.tipoPlano === "S"
											? 0
											: center.realizadoImportado || center.realizadoMes || 0,
									);
									const used = monthly ? (realized / monthly) * 100 : 0;
									return (
										<tr key={center.id} className="align-top">
											<td className="px-4 py-3">
												<p className="font-black text-slate-950">
													{center.codigo || center.id} - {center.nome}
												</p>
												<p className="mt-1 text-xs font-bold text-slate-500">
													{center.classificacao ||
														center.categoriaPrincipal ||
														"-"}
												</p>
											</td>
											<td className="px-4 py-3">
												<span
													className={`rounded-full px-2.5 py-1 text-xs font-black ${center.tipoPlano === "S" ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700"}`}
												>
													{center.tipoPlano === "S" ? "Sintético" : "Analítico"}
												</span>
											</td>
											<td className="px-4 py-3 font-bold text-slate-600">
												{center.responsavel || "-"}
											</td>
											<td className="px-4 py-3 text-right font-black text-slate-950">
												{center.tipoPlano === "S"
													? "Consolidado"
													: brl.format(monthly)}
											</td>
											<td className="px-4 py-3 text-right font-black text-slate-950">
												{center.tipoPlano === "S"
													? "Consolidado"
													: brl.format(realized)}
											</td>
											<td className="px-4 py-3 text-right font-black text-slate-950">
												{center.tipoPlano === "S"
													? "-"
													: `${decimal.format(used)}%`}
											</td>
										</tr>
									);
								})}
								{!(viewMetrics?.linkedCenters || []).length ? (
									<tr>
										<td
											colSpan={6}
											className="px-4 py-8 text-center text-sm font-bold text-slate-500"
										>
											Nenhum centro de custo vinculado a esta diretoria.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</ModalShell>
			) : null}
		</>
	);
}

function BudgetDirectoratesQuickConfigModal({
	config = {},
	canManage,
	saving,
	onClose,
	onSave,
}) {
	const existingDirectorates = useMemo(() => {
		const byKey = new Map();
		(config.centers || []).forEach((center) => {
			const name = String(center.diretoria || center.directorate || "").trim();
			if (!name) return;
			const key = normalizeImportHeader(name);
			if (!key || byKey.has(key)) return;
			byKey.set(key, {
				id: budgetEntityId(name, `diretoria-${name}`),
				nome: name,
				centers: 0,
			});
		});
		(config.centers || []).forEach((center) => {
			const key = normalizeImportHeader(center.diretoria || center.directorate || "");
			const item = byKey.get(key);
			if (item && center.tipoPlano !== "S") item.centers += 1;
		});
		return Array.from(byKey.values()).sort((left, right) =>
			left.nome.localeCompare(right.nome, "pt-BR", { numeric: true }),
		);
	}, [config.centers]);
	const savedDirectorates = useMemo(
		() => normalizeDirectorates(config.settings?.directorates, []),
		[config.settings?.directorates],
	);
	const [drafts, setDrafts] = useState(() =>
		existingDirectorates.map((directorate) => {
			const saved = findDirectorateByName(savedDirectorates, directorate.nome);
			return {
				...directorate,
				diretor: saved?.diretor || "",
				emailDiretor: saved?.emailDiretor || "",
				numeroDiretor: saved?.numeroDiretor || "",
			};
		}),
	);

	const updateDraft = (id, field, value) => {
		setDrafts((current) =>
			current.map((item) =>
				item.id === id ? { ...item, [field]: value } : item,
			),
		);
	};

	const save = () => {
		const existingKeys = new Set(
			existingDirectorates.map((item) => normalizeImportHeader(item.nome)),
		);
		const untouched = savedDirectorates.filter(
			(item) => !existingKeys.has(normalizeImportHeader(item.nome)),
		);
		const nextDirectorates = normalizeDirectorates([
			...untouched,
			...drafts.map((item) => ({
				id: item.id,
				nome: item.nome,
				diretor: item.diretor,
				emailDiretor: item.emailDiretor,
				numeroDiretor: item.numeroDiretor,
			})),
		]);
		onSave({
			...config,
			settings: {
				...(config.settings || {}),
				directorates: nextDirectorates,
			},
		});
	};

	return (
		<ModalShell
			title="Diretores por diretoria"
			description="As diretorias vêm dos centros de custo cadastrados. Informe apenas quem responde por cada uma."
			icon={<Settings size={20} />}
			onClose={onClose}
			size="5xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!canManage || saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<CheckCircle2 size={16} />
						)}
						Salvar diretores
					</button>
				</div>
			}
		>
			{drafts.length ? (
				<div className="grid gap-3">
					{drafts.map((directorate) => (
						<section
							key={directorate.id}
							className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="text-xs font-black uppercase text-slate-500">
										Diretoria
									</p>
									<h3 className="mt-1 text-base font-black text-slate-950">
										{directorate.nome}
									</h3>
									<p className="mt-1 text-xs font-bold text-slate-500">
										{integer.format(directorate.centers)} centro(s) analítico(s)
									</p>
								</div>
								<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
									Campo existente
								</span>
							</div>
							<div className="mt-4 grid gap-3 md:grid-cols-3">
								<label className="text-xs font-black uppercase text-slate-500">
									Diretor
									<input
										value={directorate.diretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(directorate.id, "diretor", event.target.value)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="Nome do diretor"
									/>
								</label>
								<label className="text-xs font-black uppercase text-slate-500">
									E-mail
									<input
										type="email"
										value={directorate.emailDiretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(
												directorate.id,
												"emailDiretor",
												event.target.value,
											)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="email@empresa.com"
									/>
								</label>
								<label className="text-xs font-black uppercase text-slate-500">
									Telefone
									<input
										value={directorate.numeroDiretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(
												directorate.id,
												"numeroDiretor",
												event.target.value,
											)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="Telefone ou WhatsApp"
									/>
								</label>
							</div>
						</section>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
					Nenhuma diretoria foi encontrada nos centros de custo.
				</div>
			)}
		</ModalShell>
	);
}

function EntityMultiSelectInput({
	label,
	value = [],
	onChange,
	options = [],
	disabled,
	helper,
	placeholder = "Digite para buscar",
}) {
	const [draft, setDraft] = useState("");
	const selected = Array.isArray(value) ? value : [];
	const datalistId = `datalist-${budgetEntityId(label)}`;
	const optionLabel = (option) =>
		`${option.codigo ? `${option.codigo} - ` : ""}${option.nome || option.name || option.id}`;
	const selectedOptions = selected
		.map((id) => options.find((option) => option.id === id))
		.filter(Boolean);
	const findMatch = () => {
		const text = String(draft || "")
			.trim()
			.toLowerCase();
		if (!text) return null;
		return (
			options.find((option) =>
				[option.id, option.codigo, option.nome, optionLabel(option)].some(
					(candidate) =>
						String(candidate || "")
							.trim()
							.toLowerCase() === text,
				),
			) ||
			options.find((option) => optionLabel(option).toLowerCase().includes(text))
		);
	};
	const addItem = () => {
		const match = findMatch();
		if (!match) return;
		onChange([...new Set([...selected, match.id])]);
		setDraft("");
	};
	const removeItem = (id) => onChange(selected.filter((item) => item !== id));

	return (
		<div className="text-xs font-black uppercase text-slate-500">
			<span>{label}</span>
			<div className="mt-2 flex gap-2">
				<input
					list={datalistId}
					value={draft}
					disabled={disabled}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addItem();
						}
					}}
					placeholder={placeholder}
					className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
				/>
				<datalist id={datalistId}>
					{options.map((option) => (
						<option key={option.id} value={optionLabel(option)} />
					))}
				</datalist>
				<button
					type="button"
					disabled={disabled || !findMatch()}
					onClick={addItem}
					className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-black normal-case text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Plus size={16} />
					Adicionar
				</button>
			</div>
			{selectedOptions.length ? (
				<div className="mt-2 flex flex-wrap gap-2">
					{selectedOptions.map((option) => (
						<span
							key={option.id}
							className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black normal-case text-blue-700"
						>
							{optionLabel(option)}
							<button
								type="button"
								disabled={disabled}
								onClick={() => removeItem(option.id)}
								className="rounded-full text-blue-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
								aria-label={`Remover ${optionLabel(option)}`}
							>
								<X size={13} />
							</button>
						</span>
					))}
				</div>
			) : null}
			{helper ? (
				<span className="mt-1 block text-[11px] font-bold normal-case text-slate-400">
					{helper}
				</span>
			) : null}
		</div>
	);
}

function CostCenterModal({
	center,
	centers = [],
	accounts = [],
	companies = [],
	branches = [],
	settings = DEFAULT_BUDGET_SETTINGS,
	onClose,
	onSave,
	canManage,
	readOnly = false,
}) {
	const [activeTab, setActiveTab] = useState("cadastro");
	const isEditing = Boolean(center?.id);
	const budgetSettings = getBudgetSettings(settings);
	const {
		accountById,
		accountSearchInCenter,
		activeMovementMonth,
		addCenterAccount,
		addCenterBranch,
		addCenterCompany,
		annualBudgetPreview,
		branchById,
		branchSearchInCenter,
		centerAccountResults,
		centerBranchResults,
		centerCompanyResults,
		companyById,
		companySearchInCenter,
		directorateOptions,
		form,
		removeCenterAccount,
		removeCenterBranch,
		removeCenterCompany,
		saldoMes,
		save,
		selectedCenterAccounts,
		selectedCenterBranches,
		selectedCenterCompanies,
		setAccountSearchInCenter,
		setActiveMovementMonth,
		setBranchSearchInCenter,
		setCompanySearchInCenter,
		update,
		updateDirectorate,
		usoPercentual,
		validationMessage,
	} = useCostCenterForm({
		center,
		accounts,
		companies,
		branches,
		budgetSettings,
		emptyCostCenter: EMPTY_COST_CENTER,
		findDirectorateByName,
		onSave,
	});
	const movementsByMonth = useMemo(
		() => buildCostCenterMovementsByMonth(form),
		[form],
	);
	const selectedMovementMonth = getSelectedCostCenterMovementMonth(
		movementsByMonth,
		activeMovementMonth,
	);
	return (
		<ModalShell
			title={
				readOnly
					? form.nome || "Centro de custo"
					: isEditing
						? "Editar centro de custo"
						: "Novo centro de custo"
			}
			description="Plano hierárquico de centro de custo com controle de CAPEX/OPEX, responsáveis e limites de orçamento."
			onClose={onClose}
			size="5xl"
			footer={
				!readOnly ? (
					<div className="flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={save}
							disabled={!canManage}
							className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
						>
							Salvar centro
						</button>
					</div>
				) : null
			}
		>
			{validationMessage ? (
				<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
					{validationMessage}
				</div>
			) : null}
			<div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
				{[
					["cadastro", "Cadastro"],
					[
						"movimentacoes",
						`Movimentações (${movementsByMonth.reduce((sum, group) => sum + group.rows.length, 0)})`,
					],
				].map(([tab, label]) => (
					<button
						key={tab}
						type="button"
						onClick={() => setActiveTab(tab)}
						className={`min-h-10 rounded-xl px-4 text-sm font-black ${activeTab === tab ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"}`}
					>
						{label}
					</button>
				))}
			</div>
			{activeTab === "movimentacoes" ? (
				<CostCenterMovementsTab
					accountById={accountById}
					branchById={branchById}
					brl={brl}
					companyById={companyById}
					integer={integer}
					movementsByMonth={movementsByMonth}
					selectedMovementMonth={selectedMovementMonth}
					setActiveMovementMonth={setActiveMovementMonth}
				/>
			) : (
				<CostCenterRegistrationTab
					accounts={accounts}
					annualBudgetPreview={annualBudgetPreview}
					branches={branches}
					brl={brl}
					budgetSettings={budgetSettings}
					canManage={canManage}
					centers={centers}
					companies={companies}
					costCenterTypes={COST_CENTER_TYPES}
					decimal={decimal}
					directorateOptions={directorateOptions}
					form={form}
					formatOptionLabel={formatOptionLabel}
					linkedFields={{
						accountSearchInCenter,
						addCenterAccount,
						addCenterBranch,
						addCenterCompany,
						branchById,
						branchSearchInCenter,
						centerAccountResults,
						centerBranchResults,
						centerCompanyResults,
						companySearchInCenter,
						removeCenterAccount,
						removeCenterBranch,
						removeCenterCompany,
						selectedCenterAccounts,
						selectedCenterBranches,
						selectedCenterCompanies,
						setAccountSearchInCenter,
						setBranchSearchInCenter,
						setCompanySearchInCenter,
					}}
					MoneyInput={MoneyInput}
					readOnly={readOnly}
					saldoMes={saldoMes}
					update={update}
					updateDirectorate={updateDirectorate}
					usoPercentual={usoPercentual}
				/>
			)}
		</ModalShell>
	);
}

function CostCenterAnalyticChildrenModal({
	synthetic,
	category,
	children = [],
	onClose,
	onView,
	onEdit,
	canManage,
}) {
	const [page, setPage] = useState(1);
	const syntheticDirectorate = findDirectorateByName(
		[
			synthetic?.diretoria
				? {
						nome: synthetic.diretoria,
						diretor: synthetic.responsavel,
						emailDiretor: synthetic.emailResponsavel,
						numeroDiretor: synthetic.telefoneResponsavel,
					}
				: null,
		].filter(Boolean),
		synthetic?.diretoria,
	);
	const pageSize = 10;
	const totalPages = Math.max(1, Math.ceil(children.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const visibleChildren = children.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<ModalShell
			title={`Analíticos de ${synthetic?.nome || "centro sintético"}`}
			description={`${synthetic?.codigo || synthetic?.id || "-"} · ${category ? `Categoria: ${category.codigo || category.id} - ${category.nome}` : "Sem categoria informada"}`}
			onClose={onClose}
			size="5xl"
		>
			<div className="space-y-4">
				<div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-500">
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{integer.format(children.length)} centro(s) analítico(s)
					</span>
					<span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
						Diretoria:{" "}
						{synthetic?.diretoria ||
							synthetic?.categoriaPrincipal ||
							"Não informada"}
					</span>
					<span className="rounded-full bg-slate-100 px-3 py-1">
						Diretor:{" "}
						{syntheticDirectorate?.diretor ||
							synthetic?.responsavel ||
							"Não informado"}
					</span>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					{visibleChildren.map((child) => {
						const childInactive =
							String(child.status || "")
								.toLowerCase()
								.includes("inativo") ||
							normalizeImportHeader(child.nome || "").includes("inativo");
						const childBudget = Number(
							child.valorMensal || child.orcamentoMensal || 0,
						);
						const childRealized = Number(child.realizadoImportado || 0);
						return (
							<article
								key={child.id}
								className={`rounded-2xl border p-4 shadow-sm ${childInactive ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-xs font-black uppercase tracking-wide text-blue-700">
											{child.codigo || child.id}
										</p>
										<h3
											className="mt-1 truncate text-base font-black text-slate-950"
											title={child.nome}
										>
											{child.nome}
										</h3>
										<p
											className="mt-1 truncate text-xs font-bold text-slate-500"
											title={child.responsavel || ""}
										>
											Responsável: {child.responsavel || "Não informado"}
										</p>
									</div>
									<span
										className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${childInactive ? "bg-slate-200 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
									>
										{child.status || "ativo"}
									</span>
								</div>
								<div className="mt-4 grid grid-cols-2 gap-3 text-xs">
									<div className="rounded-xl bg-slate-50 p-3">
										<p className="font-bold text-slate-500">Mensal</p>
										<p className="font-black text-slate-950">
											{brl.format(childBudget)}
										</p>
									</div>
									<div className="rounded-xl bg-slate-50 p-3">
										<p className="font-bold text-slate-500">Realizado</p>
										<p className="font-black text-slate-950">
											{brl.format(childRealized)}
										</p>
									</div>
								</div>
								<div className="mt-4 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => onView(child)}
										className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
									>
										<Eye size={14} /> Ver
									</button>
									<button
										type="button"
										onClick={() => onEdit(child)}
										disabled={!canManage}
										className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
									>
										<Pencil size={14} /> Editar
									</button>
								</div>
							</article>
						);
					})}
				</div>

				{totalPages > 1 ? (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
						<span className="px-2 text-xs font-black text-slate-500">
							Página {integer.format(safePage)} de {integer.format(totalPages)}
						</span>
						<span className="flex gap-2">
							<button
								type="button"
								onClick={() => setPage((value) => Math.max(1, value - 1))}
								disabled={safePage <= 1}
								className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
							>
								Anterior
							</button>
							<button
								type="button"
								onClick={() =>
									setPage((value) => Math.min(totalPages, value + 1))
								}
								disabled={safePage >= totalPages}
								className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
							>
								Próxima
							</button>
						</span>
					</div>
				) : null}
			</div>
		</ModalShell>
	);
}

function FinancialAccountViewModal({
	account,
	accounts = [],
	centers = [],
	companies = [],
	branches = [],
	onClose,
}) {
	const accountById = new Map(
		accounts.flatMap((item) => {
			const keys = [item.id, item.codigo, item.reduzida]
				.filter(Boolean)
				.map((key) => String(key).replace(/\D+/g, "") || String(key));
			return keys.map((key) => [key, item]);
		}),
	);
	const companyById = new Map(
		companies.map((company) => [company.id, company]),
	);
	const branchById = new Map(branches.map((branch) => [branch.id, branch]));
	const childrenByParent = new Map();
	accounts.forEach((item) => {
		const parentKeys = [item.parentId, item.parentCodigo]
			.filter(Boolean)
			.map((key) => String(key).replace(/\D+/g, "") || String(key));
		parentKeys.forEach((parentKey) => {
			const current = childrenByParent.get(parentKey) || [];
			current.push(item);
			childrenByParent.set(parentKey, current);
		});
	});
	const collectAccountKeys = (root) => {
		const keys = new Set();
		const queue = [root].filter(Boolean);
		while (queue.length) {
			const item = queue.shift();
			[item.id, item.codigo, item.reduzida].filter(Boolean).forEach((key) => {
				const normalized = String(key).replace(/\D+/g, "") || String(key);
				if (normalized) keys.add(normalized);
			});
			const childKeys = [item.id, item.codigo, item.reduzida]
				.filter(Boolean)
				.map((key) => String(key).replace(/\D+/g, "") || String(key));
			childKeys.forEach((key) => {
				(childrenByParent.get(key) || []).forEach((child) => {
					const childKey =
						String(child.id || child.codigo || "").replace(/\D+/g, "") ||
						String(child.id || child.codigo || "");
					if (childKey && !keys.has(childKey)) queue.push(child);
				});
			});
		}
		return keys;
	};
	const accountKeys = collectAccountKeys(account);
	const movementsByMonth = useMemo(() => {
		const groups = new Map();
		centers.forEach((center) => {
			const breakdowns =
				center.realizedByCompanyBranch ||
				center.realizadoPorEmpresaFilial ||
				[];
			breakdowns.forEach((breakdown) => {
				const movements = Array.isArray(
					breakdown.movements || breakdown.movimentacoes,
				)
					? breakdown.movements || breakdown.movimentacoes
					: [];
				const rows = movements.length
					? movements
					: [
							{
								id: breakdown.id,
								date: "",
								supplier: (
									breakdown.suppliers ||
									breakdown.fornecedores ||
									[]
								).join(", "),
								accountId: breakdown.accountId,
								companyId: breakdown.companyId,
								branchId: breakdown.branchId,
								document: "",
								type: "",
								notes: "",
								value: Number(breakdown.realized ?? breakdown.realizado ?? 0),
							},
						];
				rows.forEach((movement) => {
					const movementAccountKey =
						String(movement.accountId || breakdown.accountId || "").replace(
							/\D+/g,
							"",
						) || String(movement.accountId || breakdown.accountId || "");
					if (!movementAccountKey || !accountKeys.has(movementAccountKey))
						return;
					const year =
						Number(
							movement.year ||
								movement.ano ||
								breakdown.year ||
								breakdown.ano ||
								0,
						) || "";
					const month =
						Number(
							movement.month ||
								movement.numMes ||
								breakdown.month ||
								breakdown.numMes ||
								0,
						) || "";
					const key =
						year && month
							? `${year}-${String(month).padStart(2, "0")}`
							: "sem-periodo";
					const label =
						year && month
							? `${year} - ${budgetMonthName(month)}`
							: "Sem período";
					const group = groups.get(key) || { key, label, total: 0, rows: [] };
					const value = Number(
						movement.value ??
							movement.valor ??
							movement.realized ??
							movement.realizado ??
							0,
					);
					group.total += value;
					group.rows.push({
						...movement,
						value,
						accountId: movement.accountId || breakdown.accountId,
						companyId: movement.companyId || breakdown.companyId,
						branchId: movement.branchId || breakdown.branchId,
						centerId: center.id,
						centerName: center.nome,
					});
					groups.set(key, group);
				});
			});
		});
		return Array.from(groups.values()).sort((left, right) =>
			String(right.key).localeCompare(String(left.key)),
		);
	}, [accountKeys, centers]);
	const [activeMonth, setActiveMonth] = useState("");
	const selectedMonth =
		movementsByMonth.find((group) => group.key === activeMonth) ||
		movementsByMonth[0];
	const total = movementsByMonth.reduce((sum, group) => sum + group.total, 0);
	const rowsCount = movementsByMonth.reduce(
		(sum, group) => sum + group.rows.length,
		0,
	);

	return (
		<ModalShell
			title={`${account?.codigo || account?.id || "-"} - ${account?.nome || "Conta financeira"}`}
			description={`${account?.tipoPlano === "S" ? "Conta sintética" : "Conta analítica"} · ${account?.naturezaPlano === "C" ? "Crédito/Receita" : "Débito/Despesa"} · Movimentações importadas vinculadas à conta.`}
			onClose={onClose}
			size="6xl"
		>
			<div className="space-y-4">
				<div className="grid gap-3 md:grid-cols-4">
					<div className="rounded-2xl bg-emerald-50 p-4">
						<p className="text-xs font-black uppercase text-emerald-700">
							Total movimentado
						</p>
						<p className="mt-1 text-xl font-black text-emerald-950">
							{brl.format(total)}
						</p>
					</div>
					<div className="rounded-2xl bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Movimentações
						</p>
						<p className="mt-1 text-xl font-black text-slate-950">
							{integer.format(rowsCount)}
						</p>
					</div>
					<div className="rounded-2xl bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">Grupo</p>
						<p className="mt-1 text-sm font-black text-slate-950">
							{account?.grupo || "-"}
						</p>
					</div>
					<div className="rounded-2xl bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">
							Grupo DRE
						</p>
						<p className="mt-1 text-sm font-black text-slate-950">
							{account?.dreGroup || "-"}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					{movementsByMonth.length
						? movementsByMonth.map((group) => (
								<button
									key={group.key}
									type="button"
									onClick={() => setActiveMonth(group.key)}
									className={`rounded-xl border px-3 py-2 text-xs font-black ${selectedMonth?.key === group.key ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
								>
									{group.label}
								</button>
							))
						: null}
				</div>

				{selectedMonth ? (
					<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
									{selectedMonth.label}
								</p>
								<h4 className="text-lg font-black text-slate-950">
									{brl.format(selectedMonth.total)}
								</h4>
							</div>
							<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
								{integer.format(selectedMonth.rows.length)} movimentação(ões)
							</span>
						</div>
						<div className="max-h-[520px] overflow-auto">
							<table className="min-w-full divide-y divide-slate-100 text-sm">
								<thead className="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
									<tr>
										<th className="px-4 py-3">Data</th>
										<th className="px-4 py-3">Fornecedor</th>
										<th className="px-4 py-3">Centro</th>
										<th className="px-4 py-3">Conta analítica</th>
										<th className="px-4 py-3">Matriz / Filial</th>
										<th className="px-4 py-3 text-right">Valor</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{selectedMonth.rows.map((movement, index) => {
										const movementAccountKey =
											String(movement.accountId || "").replace(/\D+/g, "") ||
											String(movement.accountId || "");
										const movementAccount = accountById.get(movementAccountKey);
										const company = companyById.get(movement.companyId);
										const branch = branchById.get(movement.branchId);
										return (
											<tr
												key={movement.id || `${selectedMonth.key}-${index}`}
												className="align-top"
											>
												<td className="px-4 py-3 font-bold text-slate-700">
													{movement.date || "-"}
												</td>
												<td className="px-4 py-3 font-bold text-slate-900">
													{movement.supplier || movement.fornecedor || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													{movement.centerName || movement.centerId || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													{movementAccount
														? `${movementAccount.codigo || movementAccount.id} - ${movementAccount.nome}`
														: movement.accountName || movement.accountId || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													<span className="block font-bold">
														{company
															? `${company.codigo || company.id} - ${company.nome}`
															: movement.companyId || "-"}
													</span>
													<span className="block text-xs font-bold text-slate-400">
														{branch
															? `${branch.codigo || branch.id} - ${branch.nome}`
															: movement.branchId || "-"}
													</span>
												</td>
												<td className="px-4 py-3 text-right font-black text-slate-950">
													{brl.format(Number(movement.value || 0))}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				) : (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
						Nenhuma movimentação importada para esta conta financeira.
					</div>
				)}
			</div>
		</ModalShell>
	);
}

function FinancialAccountModal({
	account,
	accounts = [],
	settings = DEFAULT_BUDGET_SETTINGS,
	onClose,
	onSave,
	canManage,
}) {
	const [form, setForm] = useState({ ...EMPTY_FINANCIAL_ACCOUNT, ...account });
	const [message, setMessage] = useState("");
	const budgetSettings = getBudgetSettings(settings);
	const planAccountGroups = accounts
		.filter((item) => Number(item.nivel || 0) === 2)
		.map(
			(item) =>
				`${String(item.codigo || item.id || "").replace(/\D+/g, "")} - ${item.nome}`,
		)
		.filter((item) => item.trim() !== " -");
	const accountGroupOptions = [
		...new Set(
			[...planAccountGroups, ...(budgetSettings.accountGroups || [])].filter(
				Boolean,
			),
		),
	];
	const dreGroupOptions = [
		...new Set(
			[...planAccountGroups, ...(budgetSettings.dreGroups || [])].filter(
				Boolean,
			),
		),
	];
	const financialCategoryOptions = getFinancialAccountCategoryCatalog(
		budgetSettings.financialAccountCategories,
	).map(
		(category) => ({
			value: `${category.classType}:${category.name}`,
			name: category.name,
			classType: category.classType,
			label: `${category.name} · ${BUDGET_CATEGORY_CLASS_LABELS[category.classType] || "BASAL"}`,
		}),
	).filter(
		(category, index, all) =>
			all.findIndex((item) => item.value === category.value) === index,
	);
	const matchConfiguredOption = (value, options) => {
		const normalizedValue = normalizeImportHeader(value);
		if (!normalizedValue) return "";
		return (
			options.find(
				(option) => normalizeImportHeader(option) === normalizedValue,
			) ||
			options.find((option) =>
				normalizeImportHeader(option).endsWith(` ${normalizedValue}`),
			) ||
			""
		);
	};
	const selectedGroupValue = matchConfiguredOption(
		form.grupo,
		accountGroupOptions,
	);
	const selectedDreGroupValue = matchConfiguredOption(
		form.dreGroup,
		dreGroupOptions,
	);
	const resolvedCategory = enrichFinancialAccountWithCategory(
		form,
		budgetSettings.financialAccountCategories,
	);
	const selectedFinancialCategoryValue =
		`${form.categoriaClasse || resolvedCategory.categoriaClasse}:${form.categoriaMae || resolvedCategory.categoriaMae}`;

	const update = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));
	const updateFinancialCategory = (value) => {
		const [classType, ...nameParts] = String(value || "").split(":");
		const name = nameParts.join(":");
		setForm((current) => ({
			...current,
			categoriaMae: name,
			categoriaClasse: classType || BUDGET_CATEGORY_CLASSES.BASAL,
		}));
	};
	const save = () => {
		if (!String(form.nome || "").trim()) {
			setMessage("Informe o nome da conta financeira.");
			return;
		}
		setMessage("");
		const category = enrichFinancialAccountWithCategory(
			form,
			budgetSettings.financialAccountCategories,
		);
		onSave({
			...form,
			grupo: selectedGroupValue || form.grupo || "",
			categoriaMae: category.categoriaMae,
			categoriaClasse: category.categoriaClasse,
			dreGroup: selectedDreGroupValue || form.dreGroup || "",
		});
	};

	return (
		<ModalShell
			title={account?.id ? "Editar conta financeira" : "Nova conta financeira"}
			description="Conta financeira define a natureza do lançamento, como Água/Luz/Telefone, Materiais, Frota ou Sistemas."
			onClose={onClose}
			size="2xl"
			footer={
				<div className="flex justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!canManage}
						className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
					>
						Salvar conta
					</button>
				</div>
			}
		>
			{message ? (
				<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
					{message}
				</div>
			) : null}
			<div className="grid gap-4 md:grid-cols-2">
				<label className="text-xs font-black uppercase text-slate-500">
					Código / ID
					<input
						value={form.codigo || form.id || ""}
						disabled={!canManage}
						onChange={(event) => update("codigo", event.target.value)}
						placeholder="Ex: 3.1.02"
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome da conta
					<input
						value={form.nome || ""}
						disabled={!canManage}
						onChange={(event) => update("nome", event.target.value)}
						placeholder="Ex: Água, Luz e Telefone"
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Tipo
					<select
						value={form.tipo || "despesa"}
						disabled={!canManage}
						onChange={(event) => update("tipo", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="despesa">Despesa</option>
						<option value="receita">Receita</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Natureza
					<select
						value={form.natureza || "opex"}
						disabled={!canManage}
						onChange={(event) => update("natureza", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="opex">OPEX - operacional</option>
						<option value="capex">CAPEX - investimento</option>
						<option value="misto">Misto</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Grupo
					<select
						value={selectedGroupValue || ""}
						disabled={!canManage}
						onChange={(event) => update("grupo", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Selecione o grupo</option>
						{accountGroupOptions.map((group) => (
							<option key={group} value={group}>
								{group}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Grupo DRE
					<select
						value={selectedDreGroupValue || ""}
						disabled={!canManage}
						onChange={(event) => update("dreGroup", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Selecione o grupo DRE</option>
						{dreGroupOptions.map((group) => (
							<option key={group} value={group}>
								{group}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Categoria mãe
					<select
						value={selectedFinancialCategoryValue}
						disabled={!canManage}
						onChange={(event) => updateFinancialCategory(event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option
							value={`${BUDGET_CATEGORY_CLASSES.BASAL}:Sem categoria`}
						>
							Sem categoria · BASAL
						</option>
						{financialCategoryOptions.map((category) => (
							<option key={category.value} value={category.value}>
								{category.label}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Conta contábil / GL
					<input
						value={form.contaContabil || ""}
						disabled={!canManage}
						onChange={(event) => update("contaContabil", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Status
					<select
						value={form.status || "ativo"}
						disabled={!canManage}
						onChange={(event) => update("status", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="ativo">Ativo</option>
						<option value="inativo">Inativo</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Descrição
					<textarea
						rows={3}
						value={form.descricao || ""}
						disabled={!canManage}
						onChange={(event) => update("descricao", event.target.value)}
						placeholder="Explique quando essa conta deve ser usada."
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
			</div>
		</ModalShell>
	);
}

function BudgetCompanyBranchModal({
	type = "company",
	item,
	companies = [],
	onClose,
	onSave,
	canManage,
}) {
	const isBranch = type === "branch";
	const [form, setForm] = useState({
		...(isBranch ? EMPTY_BUDGET_BRANCH : EMPTY_BUDGET_COMPANY),
		...item,
		empresaId:
			item?.empresaId ||
			item?.companyId ||
			item?.empresas?.[0] ||
			item?.companies?.[0] ||
			"",
	});
	const [message, setMessage] = useState("");
	const update = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));

	const save = () => {
		if (!String(form.codigo || "").trim()) {
			setMessage(
				isBranch
					? "Informe o ID da filial igual aparece na coluna Empresa da planilha."
					: "Informe o ID da matriz igual aparece na coluna Filial da planilha.",
			);
			return;
		}
		if (!String(form.nome || "").trim()) {
			setMessage(
				isBranch ? "Informe o nome da filial." : "Informe o nome da matriz.",
			);
			return;
		}
		if (isBranch && !form.empresaId) {
			setMessage("Selecione a matriz dessa filial.");
			return;
		}
		setMessage("");
		onSave(
			isBranch
				? { ...form, empresas: form.empresaId ? [form.empresaId] : [] }
				: form,
			type,
		);
	};

	return (
		<ModalShell
			title={isBranch ? "Cadastro de filial" : "Cadastro de matriz"}
			description={
				isBranch
					? "Filial usa o campo Empresa da planilha e fica vinculada a uma matriz."
					: "Matriz usa o campo Filial da planilha e pode ter várias filiais com IDs repetidos em outras matrizes."
			}
			onClose={onClose}
			size="2xl"
			footer={
				<div className="flex justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!canManage}
						className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Salvar
					</button>
				</div>
			}
		>
			{message ? (
				<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
					{message}
				</div>
			) : null}
			<div className="grid gap-4 md:grid-cols-2">
				{isBranch ? (
					<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
						Matriz
						<select
							value={form.empresaId || ""}
							disabled={!canManage}
							onChange={(event) => update("empresaId", event.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						>
							<option value="">Selecione a matriz</option>
							{companies.map((company) => (
								<option key={company.id} value={company.id}>
									{company.codigo ? `${company.codigo} - ` : ""}
									{company.nome}
								</option>
							))}
						</select>
					</label>
				) : null}
				<label className="text-xs font-black uppercase text-slate-500">
					ID da {isBranch ? "filial" : "matriz"}
					<input
						value={form.codigo || ""}
						disabled={!canManage}
						onChange={(event) => update("codigo", event.target.value)}
						placeholder={isBranch ? "Ex: 2" : "Ex: 1"}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome
					<input
						value={form.nome || ""}
						disabled={!canManage}
						onChange={(event) => update("nome", event.target.value)}
						placeholder={
							isBranch
								? "Ex: Filial Ribeirão Vermelho"
								: "Ex: Sempre Telecomunicacoes LTDA"
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome fantasia
					<input
						value={form.nomeFantasia || ""}
						disabled={!canManage}
						onChange={(event) => update("nomeFantasia", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Cidade
					<input
						value={form.cidade || ""}
						disabled={!canManage}
						onChange={(event) => update("cidade", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					CNPJ
					<input
						value={form.cnpj || ""}
						disabled={!canManage}
						onChange={(event) => update("cnpj", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Status
					<select
						value={form.status || "ativo"}
						disabled={!canManage}
						onChange={(event) => update("status", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="ativo">Ativo</option>
						<option value="inativo">Inativo</option>
						<option value="bloqueado">Bloqueado</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Observações
					<textarea
						rows={3}
						value={form.observacoes || ""}
						disabled={!canManage}
						onChange={(event) => update("observacoes", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
			</div>
		</ModalShell>
	);
}

function BudgetPartnerModal({
	partner,
	accounts = [],
	centers = [],
	companies = [],
	branches = [],
	onClose,
	onSave,
	canManage,
}) {
	const [form, setForm] = useState({
		...EMPTY_BUDGET_PARTNER,
		...partner,
		centrosCusto: Array.isArray(partner?.centrosCusto)
			? partner.centrosCusto
			: [partner?.centroCustoPadraoId].filter(Boolean),
		empresas: Array.isArray(partner?.empresas) ? partner.empresas : [],
		filiais: Array.isArray(partner?.filiais) ? partner.filiais : [],
	});
	const [message, setMessage] = useState("");
	const isEditing = Boolean(partner?.id);
	const update = (field, value) =>
		setForm((current) => ({ ...current, [field]: value }));
	const toggleList = (field, value, checked) => {
		update(
			field,
			checked
				? [...new Set([...(form[field] || []), value])]
				: (form[field] || []).filter((item) => item !== value),
		);
	};
	const save = () => {
		if (!String(form.nome || "").trim()) {
			setMessage("Informe o nome do fornecedor/cliente.");
			return;
		}
		setMessage("");
		onSave({
			...form,
			centroCustoPadraoId: (form.centrosCusto || [])[0] || "",
		});
	};

	return (
		<ModalShell
			title={
				isEditing ? "Editar fornecedor / cliente" : "Novo fornecedor / cliente"
			}
			description="Vincule conta financeira, centro de custo, empresa e filial para automatizar lançamentos futuros."
			onClose={onClose}
			size="4xl"
			footer={
				<div className="flex justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!canManage}
						className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Salvar fornecedor
					</button>
				</div>
			}
		>
			{message ? (
				<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
					{message}
				</div>
			) : null}
			<div className="grid gap-4 md:grid-cols-2">
				<label className="text-xs font-black uppercase text-slate-500">
					Código / ID
					<input
						value={form.codigo || form.id || ""}
						disabled={!canManage}
						onChange={(event) => update("codigo", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Tipo
					<select
						value={form.tipo || "fornecedor"}
						disabled={!canManage}
						onChange={(event) => update("tipo", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="fornecedor">Fornecedor</option>
						<option value="cliente">Cliente</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome
					<input
						value={form.nome || ""}
						disabled={!canManage}
						onChange={(event) => update("nome", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Razão social
					<input
						value={form.razaoSocial || ""}
						disabled={!canManage}
						onChange={(event) => update("razaoSocial", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					CNPJ
					<input
						value={form.cnpj || ""}
						disabled={!canManage}
						onChange={(event) => update("cnpj", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Status
					<select
						value={form.status || "ativo"}
						disabled={!canManage}
						onChange={(event) => update("status", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="ativo">Ativo</option>
						<option value="inativo">Inativo</option>
						<option value="bloqueado">Bloqueado</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Conta financeira padrão
					<select
						value={form.contaPadraoId || ""}
						disabled={!canManage}
						onChange={(event) => update("contaPadraoId", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Sem conta padrão</option>
						{accounts.map((account) => (
							<option key={account.id} value={account.id}>
								{account.codigo ? `${account.codigo} - ` : ""}
								{account.nome}
							</option>
						))}
					</select>
				</label>
				<div className="md:col-span-2">
					<EntityMultiSelectInput
						label="Centros de custo vinculados"
						value={form.centrosCusto || []}
						options={centers}
						disabled={!canManage}
						onChange={(value) => update("centrosCusto", value)}
						helper="Digite o código ou nome do centro e clique em adicionar. O primeiro centro será usado como padrão quando necessário."
						placeholder="Ex: 110701 ou ROT"
					/>
				</div>
				<label className="text-xs font-black uppercase text-slate-500">
					E-mail
					<input
						value={form.email || ""}
						disabled={!canManage}
						onChange={(event) => update("email", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Telefone
					<input
						value={form.telefone || ""}
						disabled={!canManage}
						onChange={(event) => update("telefone", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
					<legend className="px-1 text-xs font-black uppercase text-slate-500">
						Matrizes e filiais vinculadas
					</legend>
					<div className="mt-3 grid gap-3 md:grid-cols-2">
						<div>
							<p className="text-xs font-black uppercase text-slate-500">
								Filiais
							</p>
							<div className="mt-2 grid max-h-56 gap-2 overflow-auto pr-1">
								{branches.length ? (
									branches.map((branch) => (
										<label
											key={branch.id}
											className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
										>
											<input
												type="checkbox"
												checked={(form.filiais || []).includes(branch.id)}
												disabled={!canManage}
												onChange={(event) =>
													toggleList("filiais", branch.id, event.target.checked)
												}
												className="h-4 w-4 rounded border-slate-300 text-indigo-600"
											/>
											{branch.codigo ? `${branch.codigo} - ` : ""}
											{branch.nome}
										</label>
									))
								) : (
									<p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500">
										Nenhuma filial cadastrada.
									</p>
								)}
							</div>
						</div>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">
								Matrizes
							</p>
							<div className="mt-2 grid max-h-56 gap-2 overflow-auto pr-1">
								{companies.length ? (
									companies.map((company) => (
										<label
											key={company.id}
											className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
										>
											<input
												type="checkbox"
												checked={(form.empresas || []).includes(company.id)}
												disabled={!canManage}
												onChange={(event) =>
													toggleList(
														"empresas",
														company.id,
														event.target.checked,
													)
												}
												className="h-4 w-4 rounded border-slate-300 text-indigo-600"
											/>
											{company.codigo ? `${company.codigo} - ` : ""}
											{company.nome}
										</label>
									))
								) : (
									<p className="rounded-xl bg-white p-3 text-sm font-bold text-slate-500">
										Nenhuma matriz cadastrada.
									</p>
								)}
							</div>
						</div>
					</div>
				</fieldset>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Observações
					<textarea
						rows={3}
						value={form.observacoes || ""}
						disabled={!canManage}
						onChange={(event) => update("observacoes", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
			</div>
		</ModalShell>
	);
}

function BudgetPartnerViewModal({
	partner,
	accounts = [],
	centers = [],
	companies = [],
	branches = [],
	onClose,
}) {
	const accountById = useMemo(
		() => new Map(accounts.map((account) => [account.id, account])),
		[accounts],
	);
	const centerById = useMemo(
		() => new Map(centers.map((center) => [center.id, center])),
		[centers],
	);
	const companyById = useMemo(
		() => new Map(companies.map((company) => [company.id, company])),
		[companies],
	);
	const branchById = useMemo(
		() => new Map(branches.map((branch) => [branch.id, branch])),
		[branches],
	);
	const movementsByMonth = useMemo(() => {
		const groups = new Map();
		const movements = Array.isArray(
			partner?.movements || partner?.movimentacoes,
		)
			? partner.movements || partner.movimentacoes
			: [];
		movements.forEach((movement, index) => {
			const date = String(movement.date || movement.data || "").slice(0, 10);
			const parsed = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			const year = Number(parsed?.[1] || 0);
			const month = Number(
				parsed?.[2] || movement.month || movement.numMes || 0,
			);
			const key =
				year && month
					? `${year}-${String(month).padStart(2, "0")}`
					: "sem-periodo";
			const label =
				year && month ? `${year} - ${budgetMonthName(month)}` : "Sem período";
			const group = groups.get(key) || { key, label, total: 0, rows: [] };
			const value = Number(
				movement.value ??
					movement.valor ??
					movement.realized ??
					movement.realizado ??
					0,
			);
			group.total += value;
			group.rows.push({
				...movement,
				id: movement.id || `${key}-${index}`,
				value,
			});
			groups.set(key, group);
		});
		return Array.from(groups.values()).sort((left, right) =>
			String(right.key).localeCompare(String(left.key)),
		);
	}, [partner]);
	const [activeMonth, setActiveMonth] = useState("");
	const [activeCenter, setActiveCenter] = useState("");
	const selectedMonth =
		movementsByMonth.find((group) => group.key === activeMonth) ||
		movementsByMonth[0];
	const centersInSelectedMonth = useMemo(() => {
		const centerIds = new Set(
			(selectedMonth?.rows || [])
				.map((movement) => movement.centerId || movement.centroCustoId)
				.filter(Boolean),
		);
		return Array.from(centerIds)
			.map(
				(centerId) =>
					centerById.get(centerId) || {
						id: centerId,
						codigo: centerId,
						nome: centerId,
					},
			)
			.sort((left, right) =>
				String(left.nome || left.id).localeCompare(
					String(right.nome || right.id),
					"pt-BR",
				),
			);
	}, [centerById, selectedMonth]);
	const filteredRows = activeCenter
		? (selectedMonth?.rows || []).filter(
				(movement) =>
					(movement.centerId || movement.centroCustoId) === activeCenter,
			)
		: selectedMonth?.rows || [];
	const filteredTotal = filteredRows.reduce(
		(sum, movement) => sum + Number(movement.value || 0),
		0,
	);

	return (
		<ModalShell
			title={partner?.nome || "Fornecedor"}
			description="Consulta de dados e movimentações importadas para este fornecedor."
			icon={<Eye size={20} />}
			onClose={onClose}
			size="5xl"
			footer={
				<div className="flex justify-end">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						Fechar
					</button>
				</div>
			}
		>
			<div className="grid gap-3 md:grid-cols-4">
				<div className="rounded-2xl bg-purple-50 p-4">
					<p className="text-xs font-black uppercase text-purple-700">Código</p>
					<p className="mt-1 text-lg font-black text-purple-950">
						{partner?.codigo || partner?.id || "-"}
					</p>
				</div>
				<div className="rounded-2xl bg-slate-50 p-4">
					<p className="text-xs font-black uppercase text-slate-500">Tipo</p>
					<p className="mt-1 text-lg font-black text-slate-950">
						{partner?.tipo === "cliente" ? "Cliente" : "Fornecedor"}
					</p>
				</div>
				<div className="rounded-2xl bg-emerald-50 p-4">
					<p className="text-xs font-black uppercase text-emerald-700">
						Realizado
					</p>
					<p className="mt-1 text-lg font-black text-emerald-950">
						{brl.format(partner?.totalRealizado || 0)}
					</p>
				</div>
				<div className="rounded-2xl bg-blue-50 p-4">
					<p className="text-xs font-black uppercase text-blue-700">
						Linhas importadas
					</p>
					<p className="mt-1 text-lg font-black text-blue-950">
						{integer.format(
							partner?.linhasImportadas ||
								movementsByMonth.reduce(
									(sum, group) => sum + group.rows.length,
									0,
								),
						)}
					</p>
				</div>
			</div>

			<section className="mt-5 space-y-4">
				<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h3 className="text-base font-black text-slate-950">
							Movimentações por mês
						</h3>
						<p className="text-sm font-bold text-slate-500">
							Mostra cada lançamento, centro de custo, conta financeira, empresa
							e filial.
						</p>
					</div>
					<div className="flex flex-col gap-2 lg:items-end">
						<div className="flex flex-wrap gap-2">
							{movementsByMonth.map((group) => (
								<button
									key={group.key}
									type="button"
									onClick={() => {
										setActiveMonth(group.key);
										setActiveCenter("");
									}}
									className={`rounded-xl border px-3 py-2 text-xs font-black ${selectedMonth?.key === group.key ? "border-purple-600 bg-purple-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
								>
									{group.label}
								</button>
							))}
						</div>
						{selectedMonth ? (
							<label className="flex flex-col gap-1 text-xs font-black uppercase text-slate-500 sm:min-w-72">
								Ver por centro de custo
								<select
									value={activeCenter}
									onChange={(event) => setActiveCenter(event.target.value)}
									className="min-h-10 rounded-xl border border-purple-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
								>
									<option value="">Todos os centros</option>
									{centersInSelectedMonth.map((center) => (
										<option key={center.id} value={center.id}>
											{center.codigo ? `${center.codigo} - ` : ""}
											{center.nome || center.id}
										</option>
									))}
								</select>
							</label>
						) : null}
					</div>
				</div>

				{selectedMonth ? (
					<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-xs font-black uppercase tracking-wide text-purple-700">
									{selectedMonth.label}
								</p>
								<h4 className="text-lg font-black text-slate-950">
									{brl.format(filteredTotal)}
								</h4>
								{activeCenter ? (
									<p className="text-xs font-bold text-slate-500">
										Filtrado por{" "}
										{centersInSelectedMonth.find(
											(center) => center.id === activeCenter,
										)?.nome || activeCenter}
									</p>
								) : null}
							</div>
							<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
								{integer.format(filteredRows.length)} movimentação(ões)
							</span>
						</div>
						<div className="max-h-[460px] overflow-auto">
							<table className="min-w-full divide-y divide-slate-100 text-sm">
								<thead className="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
									<tr>
										<th className="px-4 py-3">Data</th>
										<th className="px-4 py-3">Centro de custo</th>
										<th className="px-4 py-3">Conta</th>
										<th className="px-4 py-3">Matriz / Filial</th>
										<th className="px-4 py-3">Documento</th>
										<th className="px-4 py-3 text-right">Valor</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{filteredRows.map((movement) => {
										const center = centerById.get(
											movement.centerId || movement.centroCustoId,
										);
										const account = accountById.get(
											movement.accountId || movement.contaId,
										);
										const company = companyById.get(
											movement.companyId || movement.empresaId,
										);
										const branch = branchById.get(
											movement.branchId || movement.filialId,
										);
										return (
											<tr key={movement.id} className="align-top">
												<td className="px-4 py-3 font-bold text-slate-700">
													{movement.date || movement.data || "-"}
												</td>
												<td className="px-4 py-3 font-bold text-slate-900">
													{center
														? `${center.codigo || center.id} - ${center.nome}`
														: movement.centerName || movement.centerId || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													{account
														? `${account.codigo || account.id} - ${account.nome}`
														: movement.accountName || movement.accountId || "-"}
												</td>
												<td className="px-4 py-3 text-slate-600">
													<span className="block font-bold">
														{company
															? `${company.codigo || company.id} - ${company.nome}`
															: movement.companyId || "-"}
													</span>
													<span className="block text-xs font-bold text-slate-400">
														{branch
															? `${branch.codigo || branch.id} - ${branch.nome}`
															: movement.branchId || "-"}
													</span>
												</td>
												<td className="px-4 py-3 text-slate-600">
													<span className="block font-bold">
														{movement.document || movement.titulo || "-"}
													</span>
													{movement.notes ? (
														<span className="block text-xs text-slate-400">
															{movement.notes}
														</span>
													) : null}
												</td>
												<td className="px-4 py-3 text-right font-black text-slate-950">
													{brl.format(Number(movement.value || 0))}
												</td>
											</tr>
										);
									})}
									{!filteredRows.length ? (
										<tr>
											<td
												colSpan={6}
												className="px-4 py-6 text-center text-sm font-bold text-slate-500"
											>
												Nenhuma movimentação encontrada para este centro de
												custo no mês selecionado.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					</div>
				) : (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">
						Nenhuma movimentação importada para este fornecedor.
					</div>
				)}
			</section>
		</ModalShell>
	);
}

function CostCentersConfigSection({
	canManage,
}) {
	const {
		config,
		configRef,
		loading,
		saving,
		message,
		feedback,
		accountModal,
		accountViewModal,
		accountSearch,
		accountStatusFilter,
		companyBranchModal,
		partnerModal,
		partnerViewModal,
		modalState,
		analyticChildrenModal,
		matrixCenterFilter,
		partnerSearch,
		centerSearch,
		centerStatusFilter,
		centerPage,
		parametersOpen,
		loadCostCenters,
		saveConfig,
		updateSettings,
		setFeedback,
		setAccountModal,
		setAccountViewModal,
		setAccountSearch,
		setAccountStatusFilter,
		setCompanyBranchModal,
		setPartnerModal,
		setPartnerViewModal,
		setModalState,
		setAnalyticChildrenModal,
		setMatrixCenterFilter,
		setPartnerSearch,
		setCenterSearch,
		setCenterStatusFilter,
		setCenterPage,
		setParametersOpen,
	} = useBudgetConfig({
		defaultSettings: DEFAULT_BUDGET_SETTINGS,
		getBudgetSettings,
		getVisibleError,
		normalizeDirectorates,
		normalizeFinancialAccountCategories,
		normalizeList,
	});
	const [accountCategoriesModalOpen, setAccountCategoriesModalOpen] =
		useState(false);

	const upsertAccount = (account) => {
		setAccountModal(null);
		saveConfig(upsertBudgetAccount(account, config));
	};

	const removeAccount = (accountId) => {
		saveConfig(removeBudgetAccount(accountId, config));
	};

	const upsertPartner = (partner) => {
		setPartnerModal(null);
		saveConfig(upsertBudgetPartner(partner, config));
	};

	const removePartner = (partnerId) => {
		saveConfig(removeBudgetPartner(partnerId, config));
	};

	const upsertCompanyOrBranch = (item, type) => {
		setCompanyBranchModal(null);
		saveConfig(upsertBudgetCompanyOrBranch(item, type, config));
	};

	const removeCompany = (companyId) => {
		saveConfig(removeBudgetCompany(companyId, config));
	};

	const removeBranch = (branchId) => {
		saveConfig(removeBudgetBranch(branchId, config));
	};

	const upsertCenter = (center) => {
		saveConfig(upsertBudgetCenter(center, config, budgetSettings.directorates));
	};

	const removeCenter = (centerId) => {
		saveConfig(removeBudgetCenter(centerId, config));
	};

	const budgetSettings = getBudgetSettings(config.settings);
	const budgetableCenters = (config.centers || []).filter(
		(center) => center.tipoPlano !== "S",
	);
	const totals = budgetableCenters.reduce(
		(acc, center) => {
			const monthlyBudget = Number(
				center.valorMensal || center.orcamentoMensal || 0,
			);
			acc.mensal += monthlyBudget;
			acc.anual += monthlyBudget * 12;
			acc.capex +=
				center.tipoDespesa === "capex" || center.tipoDespesa === "misto"
					? monthlyBudget
					: 0;
			acc.opex +=
				center.tipoDespesa === "opex" || center.tipoDespesa === "misto"
					? monthlyBudget
					: 0;
			return acc;
		},
		{ mensal: 0, anual: 0, capex: 0, opex: 0 },
	);
	const matrixTotal = (config.matrix || []).reduce(
		(sum, row) =>
			sum +
			(Array.isArray(row.months)
				? row.months.reduce(
						(monthSum, value) => monthSum + Number(value || 0),
						0,
					)
				: Number(row.total || 0)),
		0,
	);
	const syntheticCenterIds = new Set(
		(config.centers || [])
			.filter((center) => center.tipoPlano === "S")
			.map((center) => center.id),
	);
	const matrixRows = (
		matrixCenterFilter
			? (config.matrix || []).filter(
					(row) => row.costCenterId === matrixCenterFilter,
				)
			: config.matrix || []
	).filter((row) => !syntheticCenterIds.has(row.costCenterId));
	const normalizedPartnerSearch = normalizeImportHeader(partnerSearch);
	const filteredPartners = normalizedPartnerSearch
		? (config.partners || []).filter((partner) => {
				const haystack = normalizeImportHeader(
					[
						partner.codigo,
						partner.id,
						partner.nome,
						partner.razaoSocial,
						partner.cnpj,
					]
						.filter(Boolean)
						.join(" "),
				);
				return haystack.includes(normalizedPartnerSearch);
			})
		: config.partners || [];
	const isAccountInactive = (account) => {
		const status = String(account?.status || "").toLowerCase();
		const name = normalizeImportHeader(account?.nome || "");
		return status.includes("inativo") || name.includes("inativo");
	};
	const sortedAccounts = [...(config.accounts || [])].sort((left, right) => {
		const leftInactive = isAccountInactive(left) ? 1 : 0;
		const rightInactive = isAccountInactive(right) ? 1 : 0;
		if (leftInactive !== rightInactive) return leftInactive - rightInactive;
		return String(left.classificacao || left.codigo || left.nome).localeCompare(
			String(right.classificacao || right.codigo || right.nome),
			"pt-BR",
			{ numeric: true },
		);
	});
	const normalizedCenterSearch = normalizeImportHeader(centerSearch);
	const isCenterInactive = (center) => {
		const status = String(center?.status || "").toLowerCase();
		const name = normalizeImportHeader(center?.nome || "");
		return status.includes("inativo") || name.includes("inativo");
	};
	const isStatusVisible = (center) => {
		const inactive = isCenterInactive(center);
		if (centerStatusFilter === "ativos") return !inactive;
		if (centerStatusFilter === "inativos") return inactive;
		return true;
	};
	const centerTextMatches = (center, related = []) => {
		if (!normalizedCenterSearch) return true;
		const haystack = normalizeImportHeader(
			[
				center?.codigo,
				center?.reduzida,
				center?.classificacao,
				center?.nome,
				center?.tipoPlano,
				center?.status,
				...related.flatMap((item) => [
					item?.codigo,
					item?.reduzida,
					item?.classificacao,
					item?.nome,
				]),
			]
				.filter(Boolean)
				.join(" "),
		);
		return haystack.includes(normalizedCenterSearch);
	};
	const sortedCenters = [...(config.centers || [])].sort((left, right) => {
		const leftInactive = isCenterInactive(left) ? 1 : 0;
		const rightInactive = isCenterInactive(right) ? 1 : 0;
		if (leftInactive !== rightInactive) return leftInactive - rightInactive;
		return String(left.classificacao || left.codigo || left.nome).localeCompare(
			String(right.classificacao || right.codigo || right.nome),
			"pt-BR",
			{ numeric: true },
		);
	});
	const centerByKey = new Map();
	sortedCenters.forEach((center) => {
		if (center.id) centerByKey.set(center.id, center);
		if (center.codigo) centerByKey.set(center.codigo, center);
		if (center.reduzida)
			centerByKey.set(String(center.reduzida).replace(/\D+/g, ""), center);
	});
	const categoriesByCode = new Map(
		sortedCenters
			.filter((center) => Number(center.nivel || 0) === 2)
			.map((center) => [center.codigo || center.id, center]),
	);
	const childrenByParent = new Map();
	sortedCenters
		.filter((center) => center.tipoPlano === "A")
		.forEach((center) => {
			const parentKey = center.parentId || center.parentCodigo;
			if (!parentKey) return;
			const currentChildren = childrenByParent.get(parentKey) || [];
			currentChildren.push(center);
			childrenByParent.set(parentKey, currentChildren);
		});
	const syntheticGroups = sortedCenters
		.filter(
			(center) => center.tipoPlano === "S" && Number(center.nivel || 0) > 2,
		)
		.map((center) => {
			const category =
				categoriesByCode.get(center.categoriaCodigo) ||
				centerByKey.get(center.categoriaCodigo);
			const rawChildren = [
				...(childrenByParent.get(center.id) || []),
				...(center.codigo && center.codigo !== center.id
					? childrenByParent.get(center.codigo) || []
					: []),
			]
				.filter(
					(child, index, items) =>
						items.findIndex((item) => item.id === child.id) === index,
				)
				.sort((left, right) => {
					const leftInactive = isCenterInactive(left) ? 1 : 0;
					const rightInactive = isCenterInactive(right) ? 1 : 0;
					if (leftInactive !== rightInactive)
						return leftInactive - rightInactive;
					return String(
						left.classificacao || left.codigo || left.nome,
					).localeCompare(
						String(right.classificacao || right.codigo || right.nome),
						"pt-BR",
						{ numeric: true },
					);
				});
			const visibleChildrenByStatus = rawChildren.filter(isStatusVisible);
			const parentMatches = centerTextMatches(center, [category]);
			const matchingChildren = visibleChildrenByStatus.filter((child) =>
				centerTextMatches(child, [center, category]),
			);
			const visibleChildren = normalizedCenterSearch
				? parentMatches
					? visibleChildrenByStatus
					: matchingChildren
				: visibleChildrenByStatus;
			const groupVisibleByStatus =
				isStatusVisible(center) || visibleChildren.length > 0;
			if (!groupVisibleByStatus) return null;
			if (normalizedCenterSearch && !parentMatches && !visibleChildren.length)
				return null;
			return {
				center,
				category,
				children: visibleChildren,
				aggregateChildren: rawChildren,
				totalChildren: rawChildren.length,
			};
		})
		.filter(Boolean);
	const filteredCenters = syntheticGroups;
	const visibleAnalyticCount = filteredCenters.reduce(
		(sum, group) => sum + group.children.length,
		0,
	);
	const totalSyntheticCount = sortedCenters.filter(
		(center) => center.tipoPlano === "S" && Number(center.nivel || 0) > 2,
	).length;
	const totalAnalyticCount = sortedCenters.filter(
		(center) => center.tipoPlano === "A",
	).length;
	const centerPageSize = 12;
	const centerTotalPages = Math.max(
		1,
		Math.ceil(filteredCenters.length / centerPageSize),
	);
	const safeCenterPage = Math.min(centerPage, centerTotalPages);
	const paginatedCenterGroups = filteredCenters.slice(
		(safeCenterPage - 1) * centerPageSize,
		safeCenterPage * centerPageSize,
	);

	useEffect(() => {
		setCenterPage(1);
	}, [centerSearch, centerStatusFilter, setCenterPage]);

	useEffect(() => {
		if (centerPage > centerTotalPages) setCenterPage(centerTotalPages);
	}, [centerPage, centerTotalPages, setCenterPage]);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="flex items-start gap-3">
					<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
						<Landmark size={20} />
					</span>
					<div>
						<h2 className="text-lg font-bold text-slate-950">
							Plano de centros de custo
						</h2>
						<p className="mt-1 text-xs font-bold text-slate-500">
							Última atualização: {formatUpdatedAt(config.updatedAt)} ·{" "}
							{config.centers?.length || 0} centro(s)
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={loadCostCenters}
						disabled={loading || saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
					>
						<RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
						Atualizar
					</button>
					<button
						type="button"
						onClick={() => setAccountCategoriesModalOpen(true)}
						disabled={loading || saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
					>
						<Settings size={16} /> Categorias
					</button>
					<button
						type="button"
						onClick={() =>
							saveConfig(configRef.current, "Configurações salvas.")
						}
						disabled={!canManage || saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? (
							<Loader2 className="animate-spin" size={16} />
						) : (
							<CheckCircle2 size={16} />
						)}{" "}
						Salvar
					</button>
				</div>
			</div>

			{message ? (
				<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}

			<BudgetParametersSection
				budgetSettings={budgetSettings}
				canManage={canManage}
				centers={config.centers || []}
				disabled={!canManage || saving}
				DirectoratesDropdownSection={DirectoratesDropdownSection}
				ListConfigInput={ListConfigInput}
				onChangeSettings={updateSettings}
				open={parametersOpen}
				setOpen={setParametersOpen}
			/>

			<div className="mt-5 grid gap-3 md:grid-cols-4">
				<div className="rounded-2xl bg-slate-50 p-4">
					<p className="text-xs font-black uppercase text-slate-500">
						Orçamento mensal
					</p>
					<p className="mt-1 text-xl font-black text-slate-950">
						{brl.format(totals.mensal)}
					</p>
				</div>
				<div className="rounded-2xl bg-slate-50 p-4">
					<p className="text-xs font-black uppercase text-slate-500">
						Orçamento anual
					</p>
					<p className="mt-1 text-xl font-black text-slate-950">
						{brl.format(totals.anual)}
					</p>
				</div>
				<div className="rounded-2xl bg-blue-50 p-4">
					<p className="text-xs font-black uppercase text-blue-700">
						CAPEX mensal
					</p>
					<p className="mt-1 text-xl font-black text-blue-950">
						{brl.format(totals.capex)}
					</p>
				</div>
				<div className="rounded-2xl bg-emerald-50 p-4">
					<p className="text-xs font-black uppercase text-emerald-700">
						OPEX mensal
					</p>
					<p className="mt-1 text-xl font-black text-emerald-950">
						{brl.format(totals.opex)}
					</p>
				</div>
			</div>
			<div className="mt-3 grid gap-3 md:grid-cols-4">
				<div className="rounded-2xl bg-amber-50 p-4">
					<p className="text-xs font-black uppercase text-amber-700">
						Plano de contas
					</p>
					<p className="mt-1 text-xl font-black text-amber-950">
						{integer.format((config.accounts || []).length)}
					</p>
				</div>
				<div className="rounded-2xl bg-purple-50 p-4">
					<p className="text-xs font-black uppercase text-purple-700">
						Fornec./Clientes
					</p>
					<p className="mt-1 text-xl font-black text-purple-950">
						{integer.format((config.partners || []).length)}
					</p>
				</div>
				<div className="rounded-2xl bg-rose-50 p-4">
					<p className="text-xs font-black uppercase text-rose-700">
						Matriz anual
					</p>
					<p className="mt-1 text-xl font-black text-rose-950">
						{brl.format(matrixTotal)}
					</p>
				</div>
				<div className="rounded-2xl bg-cyan-50 p-4">
					<p className="text-xs font-black uppercase text-cyan-700">
						Budget/Forecast
					</p>
					<p className="mt-1 text-xl font-black text-cyan-950">
						{integer.format((config.versions || []).length)}
					</p>
				</div>
			</div>

			<CompaniesBranchesConfigSection
				BudgetDropdownSection={BudgetDropdownSection}
				branches={config.branches || []}
				canManage={canManage}
				companies={config.companies || []}
				onCreateBranch={() =>
					setCompanyBranchModal({
						type: "branch",
						item: EMPTY_BUDGET_BRANCH,
					})
				}
				onCreateCompany={() =>
					setCompanyBranchModal({
						type: "company",
						item: EMPTY_BUDGET_COMPANY,
					})
				}
				onEditBranch={(branch) =>
					setCompanyBranchModal({ type: "branch", item: branch })
				}
				onEditCompany={(company) =>
					setCompanyBranchModal({ type: "company", item: company })
				}
				onRemoveBranch={removeBranch}
				onRemoveCompany={removeCompany}
				saving={saving}
			/>

			<FinancialAccountsConfigSection
				BudgetDropdownSection={BudgetDropdownSection}
				EMPTY_FINANCIAL_ACCOUNT={EMPTY_FINANCIAL_ACCOUNT}
				accountSearch={accountSearch}
				accountStatusFilter={accountStatusFilter}
				budgetSettings={budgetSettings}
				canManage={canManage}
				isAccountInactive={isAccountInactive}
				onChangeSettings={updateSettings}
				removeAccount={removeAccount}
				saving={saving}
				setAccountModal={setAccountModal}
				setAccountSearch={setAccountSearch}
				setAccountStatusFilter={setAccountStatusFilter}
				setAccountViewModal={setAccountViewModal}
				sortedAccounts={sortedAccounts}
			/>

			{accountCategoriesModalOpen ? (
				<FinancialAccountCategoriesModal
					budgetSettings={budgetSettings}
					canManage={canManage}
					onChangeSettings={updateSettings}
					onClose={() => setAccountCategoriesModalOpen(false)}
					saving={saving}
				/>
			) : null}

			<CostCentersTreeConfigSection
				COST_CENTER_TYPES={COST_CENTER_TYPES}
				EMPTY_COST_CENTER={EMPTY_COST_CENTER}
				budgetSettings={budgetSettings}
				canManage={canManage}
				centerSearch={centerSearch}
				centerStatusFilter={centerStatusFilter}
				centerTotalPages={centerTotalPages}
				config={config}
				filteredCenters={filteredCenters}
				findDirectorateByName={findDirectorateByName}
				isCenterInactive={isCenterInactive}
				loading={loading}
				paginatedCenterGroups={paginatedCenterGroups}
				removeCenter={removeCenter}
				safeCenterPage={safeCenterPage}
				saving={saving}
				setAnalyticChildrenModal={setAnalyticChildrenModal}
				setCenterPage={setCenterPage}
				setCenterSearch={setCenterSearch}
				setCenterStatusFilter={setCenterStatusFilter}
				setModalState={setModalState}
				totalAnalyticCount={totalAnalyticCount}
				totalSyntheticCount={totalSyntheticCount}
				visibleAnalyticCount={visibleAnalyticCount}
			/>

			<PartnersConfigSection
				BudgetDropdownSection={BudgetDropdownSection}
				canManage={canManage}
				config={config}
				filteredPartners={filteredPartners}
				onCreatePartner={() =>
					setPartnerModal({ partner: EMPTY_BUDGET_PARTNER })
				}
				onEditPartner={(partner) => setPartnerModal({ partner })}
				onRemovePartner={removePartner}
				onViewPartner={(partner) => setPartnerViewModal({ partner })}
				partnerSearch={partnerSearch}
				saving={saving}
				setPartnerSearch={setPartnerSearch}
			/>

			<div className="mt-5 grid gap-4 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h3 className="text-sm font-black text-slate-950">
						Rateio e aprovação
					</h3>
					<div className="mt-3 grid gap-2">
						{(config.allocationRules || []).slice(0, 3).map((rule) => (
							<div
								key={rule.id}
								className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600"
							>
								<span className="block text-sm font-black text-slate-950">
									{rule.nome}
								</span>
								{(rule.splits || [])
									.map(
										(split) =>
											`${(config.centers || []).find((item) => item.id === split.costCenterId)?.nome || split.costCenterId}: ${split.percent}%`,
									)
									.join(" · ")}
							</div>
						))}
						<p className="rounded-xl bg-blue-50 p-3 text-xs font-black text-blue-800">
							Workflow: {config.workflow?.enabled ? "ativo" : "inativo"} ·
							Aprovador: {config.workflow?.approverName || "não configurado"}
						</p>
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h3 className="text-sm font-black text-slate-950">
						Caixa e previsibilidade
					</h3>
					<dl className="mt-3 grid gap-2">
						<div className="rounded-xl bg-slate-50 p-3">
							<dt className="text-xs font-bold text-slate-500">
								Saldo inicial
							</dt>
							<dd className="text-sm font-black text-slate-950">
								{brl.format(config.cashSettings?.bankBalance || 0)}
							</dd>
						</div>
						<div className="rounded-xl bg-slate-50 p-3">
							<dt className="text-xs font-bold text-slate-500">Projeção</dt>
							<dd className="text-sm font-black text-slate-950">
								D+{config.cashSettings?.projectionDays || 90}
							</dd>
						</div>
						<div className="rounded-xl bg-slate-50 p-3">
							<dt className="text-xs font-bold text-slate-500">Rollover</dt>
							<dd className="text-sm font-black text-slate-950">
								{config.cashSettings?.rolloverHour || "00:15"}
							</dd>
						</div>
					</dl>
				</section>
			</div>

			<BudgetMatrixConfigSection
				BudgetDropdownSection={BudgetDropdownSection}
				accounts={config.accounts || []}
				budgetAccountLabel={budgetAccountLabel}
				centers={config.centers || []}
				matrixCenterFilter={matrixCenterFilter}
				matrixRows={matrixRows}
				months={BUDGET_MONTHS}
				setMatrixCenterFilter={setMatrixCenterFilter}
			/>

			{accountModal ? (
				<FinancialAccountModal
					account={accountModal.account}
					accounts={config.accounts || []}
					settings={budgetSettings}
					canManage={canManage}
					onClose={() => setAccountModal(null)}
					onSave={upsertAccount}
				/>
			) : null}
			{accountViewModal ? (
				<FinancialAccountViewModal
					account={accountViewModal.account}
					accounts={config.accounts || []}
					centers={config.centers || []}
					companies={config.companies || []}
					branches={config.branches || []}
					onClose={() => setAccountViewModal(null)}
				/>
			) : null}
			{companyBranchModal ? (
				<BudgetCompanyBranchModal
					type={companyBranchModal.type}
					item={companyBranchModal.item}
					companies={config.companies || []}
					branches={config.branches || []}
					canManage={canManage}
					onClose={() => setCompanyBranchModal(null)}
					onSave={upsertCompanyOrBranch}
				/>
			) : null}
			{partnerModal ? (
				<BudgetPartnerModal
					partner={partnerModal.partner}
					accounts={config.accounts || []}
					centers={config.centers || []}
					companies={config.companies || []}
					branches={config.branches || []}
					canManage={canManage}
					onClose={() => setPartnerModal(null)}
					onSave={upsertPartner}
				/>
			) : null}
			{partnerViewModal ? (
				<BudgetPartnerViewModal
					partner={partnerViewModal.partner}
					accounts={config.accounts || []}
					centers={config.centers || []}
					companies={config.companies || []}
					branches={config.branches || []}
					onClose={() => setPartnerViewModal(null)}
				/>
			) : null}
			{modalState ? (
				<CostCenterModal
					center={modalState.center}
					centers={config.centers || []}
					accounts={config.accounts || []}
					companies={config.companies || []}
					branches={config.branches || []}
					settings={budgetSettings}
					readOnly={modalState.mode === "view"}
					canManage={canManage}
					onClose={() => setModalState(null)}
					onSave={upsertCenter}
				/>
			) : null}
			{analyticChildrenModal ? (
				<CostCenterAnalyticChildrenModal
					synthetic={analyticChildrenModal.synthetic}
					category={analyticChildrenModal.category}
					children={analyticChildrenModal.children}
					canManage={canManage}
					onClose={() => setAnalyticChildrenModal(null)}
					onView={(center) => {
						setAnalyticChildrenModal(null);
						setModalState({ mode: "view", center });
					}}
					onEdit={(center) => {
						setAnalyticChildrenModal(null);
						setModalState({ mode: "edit", center });
					}}
				/>
			) : null}
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
		</section>
	);
}

function ConfiguracoesPage({ canManage }) {
	const [sheetsConfig, setSheetsConfig] = useState(DEFAULT_SHEETS_CONFIG);
	const [logs, setLogs] = useState([]);
	const [sheetsLoading, setSheetsLoading] = useState(true);
	const [sheetsAction, setSheetsAction] = useState("");
	const [sheetsMessage, setSheetsMessage] = useState("");
	const [sheetsFeedback, setSheetsFeedback] = useState(null);

	const loadSheetsConfig = useCallback(async () => {
		setSheetsLoading(true);
		setSheetsMessage("");
		try {
			const [config, logsResponse] = await Promise.all([
				buscarConfigPlanilhasFinanceiro(),
				buscarLogsPlanilhasFinanceiro(8).catch(() => ({ items: [] })),
			]);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...config,
				sources: config.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setLogs(logsResponse.items || []);
		} catch (error) {
			setSheetsMessage(
				error?.message ||
					"Não foi possível carregar a configuração das planilhas.",
			);
		} finally {
			setSheetsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSheetsConfig();
	}, [loadSheetsConfig]);

	const updateSource = (sourceId, field, value) => {
		setSheetsConfig((current) => ({
			...current,
			sources: (current.sources || []).map((source) =>
				source.id === sourceId ? { ...source, [field]: value } : source,
			),
		}));
	};

	const handleSaveSheets = async () => {
		setSheetsAction("save");
		setSheetsMessage("");
		try {
			const response = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...response.config,
				sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setSheetsMessage("Configuração das Google Planilhas salva.");
		} catch (error) {
			setSheetsMessage(
				error?.message || "Falha ao salvar a configuração das planilhas.",
			);
		} finally {
			setSheetsAction("");
		}
	};

	const handleSyncSheets = async () => {
		setSheetsAction("sync");
		setSheetsMessage("");
		try {
			const response = await sincronizarPlanilhasFinanceiro();
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...response.config,
				sources: response.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			setSheetsMessage(response.message || "Leitura das planilhas concluída.");
			setSheetsFeedback({
				type: response.ok ? "success" : "error",
				title: response.ok ? "Leitura concluída" : "Leitura com falhas",
				message: response.message || "Leitura das planilhas concluída.",
				details: (response.results || [])
					.map(
						(item) =>
							`${item.label}: ${item.status} · ${integer.format(item.totalRows || 0)} linha(s)${item.message ? ` · ${item.message}` : ""}`,
					)
					.join("\n"),
			});
			await loadSheetsConfig();
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao ler as planilhas financeiras.",
			);
			setSheetsMessage(visibleError.message);
			setSheetsFeedback({
				type: "error",
				title: "Erro na leitura",
				...visibleError,
			});
		} finally {
			setSheetsAction("");
		}
	};

	const handleTestSource = async (sourceId) => {
		setSheetsAction(`test:${sourceId}`);
		setSheetsMessage("");
		try {
			const saved = await salvarConfigPlanilhasFinanceiro(sheetsConfig);
			setSheetsConfig({
				...DEFAULT_SHEETS_CONFIG,
				...saved.config,
				sources: saved.config?.sources || DEFAULT_SHEETS_CONFIG.sources,
			});
			const response = await testarPlanilhaFinanceiro(sourceId);
			const totalRows = response.result?.totalRows ?? 0;
			setSheetsMessage(
				`Teste concluído: ${totalRows} linha(s) lida(s) na origem selecionada.`,
			);
			setSheetsFeedback({
				type: "success",
				title: "Teste concluído",
				message: `${integer.format(totalRows)} linha(s) lida(s) na origem selecionada.`,
				details: `Range: ${response.result?.range || "-"}\nColunas: ${integer.format(response.result?.totalColumns || 0)}`,
			});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao testar a planilha.",
			);
			setSheetsMessage(visibleError.message);
			setSheetsFeedback({
				type: "error",
				title: "Erro no teste",
				...visibleError,
			});
		} finally {
			setSheetsAction("");
		}
	};

	const handleCopyServiceAccount = async () => {
		const email = sheetsConfig.serviceAccountEmail || "";
		if (!email) return;
		try {
			await navigator.clipboard.writeText(email);
			setSheetsMessage("E-mail da Service Account copiado.");
		} catch {
			setSheetsMessage(
				"Não foi possível copiar automaticamente. Selecione o e-mail e copie manualmente.",
			);
		}
	};

	return (
		<section className="space-y-5">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
							<TableProperties size={20} />
						</span>
						<div>
							<h2 className="text-lg font-bold text-slate-950">
								Google Planilhas
							</h2>
							<p className="text-sm font-semibold text-slate-500">
								Configure a leitura automática das planilhas financeiras a cada
								intervalo definido.
							</p>
							<p className="mt-1 text-xs font-bold text-slate-500">
								Service Account:{" "}
								{sheetsConfig.serviceAccountConfigured
									? "configurada"
									: "não configurada"}{" "}
								· Última leitura: {formatUpdatedAt(sheetsConfig.lastRunAt)} ·
								Próxima: {formatUpdatedAt(sheetsConfig.nextRunAt)}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={loadSheetsConfig}
							disabled={sheetsLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={sheetsLoading ? "animate-spin" : ""}
							/>{" "}
							Atualizar
						</button>
						<button
							type="button"
							onClick={handleSaveSheets}
							disabled={!canManage || Boolean(sheetsAction)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
						>
							{sheetsAction === "save" ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<CheckCircle2 size={16} />
							)}{" "}
							Salvar
						</button>
						<button
							type="button"
							onClick={handleSyncSheets}
							disabled={!canManage || Boolean(sheetsAction)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							{sheetsAction === "sync" ? (
								<Loader2 className="animate-spin" size={16} />
							) : (
								<RefreshCw size={16} />
							)}{" "}
							Ler agora
						</button>
					</div>
				</div>

				{sheetsMessage ? (
					<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
						{sheetsMessage}
					</div>
				) : null}

				<div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
					<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-900">
							<span>Automação ativa</span>
							<input
								type="checkbox"
								checked={Boolean(sheetsConfig.enabled)}
								disabled={!canManage}
								onChange={(event) =>
									setSheetsConfig((current) => ({
										...current,
										enabled: event.target.checked,
									}))
								}
								className="h-5 w-5 rounded border-slate-300 text-blue-600"
							/>
						</label>
						<label className="mt-4 block text-xs font-bold uppercase text-slate-500">
							Intervalo de leitura
							<input
								type="number"
								min="5"
								max="1440"
								value={sheetsConfig.intervalMinutes || 30}
								disabled={!canManage}
								onChange={(event) =>
									setSheetsConfig((current) => ({
										...current,
										intervalMinutes: event.target.value,
									}))
								}
								className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
							/>
						</label>
						<p className="mt-3 text-xs font-semibold text-slate-500">
							A planilha precisa ser compartilhada com o e-mail da Service
							Account usada no Google Drive.
						</p>
						<div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
							<p className="text-xs font-black uppercase tracking-wide text-emerald-700">
								Usuário de leitura
							</p>
							<p className="mt-1 break-all text-sm font-black text-slate-950">
								{sheetsConfig.serviceAccountEmail ||
									"Service Account não identificada"}
							</p>
							{sheetsConfig.serviceAccountProjectId ? (
								<p className="mt-1 break-all text-xs font-bold text-emerald-800">
									Projeto: {sheetsConfig.serviceAccountProjectId}
								</p>
							) : null}
							{sheetsConfig.serviceAccountError ? (
								<p className="mt-2 text-xs font-bold text-red-700">
									{sheetsConfig.serviceAccountError}
								</p>
							) : (
								<p className="mt-2 text-xs font-semibold text-emerald-800">
									Compartilhe cada planilha com este e-mail como Leitor.
								</p>
							)}
							<button
								type="button"
								onClick={handleCopyServiceAccount}
								disabled={!sheetsConfig.serviceAccountEmail}
								className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Copy size={14} /> Copiar e-mail
							</button>
						</div>
					</div>

					<div className="space-y-4">
						{(sheetsConfig.sources || []).map((source) => (
							<div
								key={source.id}
								className="rounded-2xl border border-slate-200 p-4"
							>
								<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
									<label className="flex items-center gap-3 text-sm font-bold text-slate-950">
										<input
											type="checkbox"
											checked={Boolean(source.enabled)}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "enabled", event.target.checked)
											}
											className="h-5 w-5 rounded border-slate-300 text-blue-600"
										/>
										{source.label}
									</label>
									<button
										type="button"
										disabled={!canManage || Boolean(sheetsAction)}
										onClick={() => handleTestSource(source.id)}
										className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
									>
										{sheetsAction === `test:${source.id}` ? (
											<Loader2 className="animate-spin" size={14} />
										) : (
											<TableProperties size={14} />
										)}{" "}
										Testar
									</button>
								</div>
								<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<label className="text-xs font-bold uppercase text-slate-500">
										ID ou link da planilha
										<input
											value={
												source.spreadsheetUrl ?? source.spreadsheetId ?? ""
											}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(
													source.id,
													"spreadsheetUrl",
													event.target.value,
												)
											}
											placeholder="https://docs.google.com/spreadsheets/d/..."
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									<label className="text-xs font-bold uppercase text-slate-500">
										Aba
										<input
											value={source.sheetName || ""}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "sheetName", event.target.value)
											}
											placeholder="Ex: Agosto"
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									<label className="text-xs font-bold uppercase text-slate-500">
										Linha do cabeçalho
										<input
											type="number"
											min="1"
											value={source.headerRow || 1}
											disabled={!canManage}
											onChange={(event) =>
												updateSource(source.id, "headerRow", event.target.value)
											}
											className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
										/>
									</label>
									{source.id === "serasa" ? (
										<label className="text-xs font-bold uppercase text-slate-500">
											Atualizar a cada
											<select
												value={source.intervalMinutes || 60}
												disabled={!canManage}
												onChange={(event) =>
													updateSource(
														source.id,
														"intervalMinutes",
														event.target.value,
													)
												}
												className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
											>
												<option value="30">30 minutos</option>
												<option value="60">1 hora</option>
												<option value="120">2 horas</option>
												<option value="240">4 horas</option>
												<option value="720">12 horas</option>
											</select>
										</label>
									) : null}
								</div>
								<p className="mt-3 text-xs font-bold text-slate-500">
									Última leitura: {formatUpdatedAt(source.lastReadAt)} · Status:{" "}
									{source.lastStatus || "-"} · Linhas: {source.lastRows || 0} ·{" "}
									{source.lastMessage || "Sem leitura ainda."}
								</p>
							</div>
						))}
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<h3 className="text-sm font-bold text-slate-950">
						Últimos logs de leitura
					</h3>
					<div className="mt-3 divide-y divide-slate-200">
						{logs.length ? (
							logs.map((item) => (
								<div
									key={item.id}
									className="flex flex-col gap-1 py-3 text-xs font-bold text-slate-600 md:flex-row md:items-center md:justify-between"
								>
									<span>
										{formatUpdatedAt(item.createdAt)} · {item.status}
									</span>
									<span className="text-slate-900">{item.message}</span>
								</div>
							))
						) : (
							<p className="py-4 text-sm font-bold text-slate-500">
								Nenhum log de leitura registrado.
							</p>
						)}
					</div>
				</div>
			</section>
			<FeedbackModal
				feedback={sheetsFeedback}
				onClose={() => setSheetsFeedback(null)}
			/>
		</section>
	);
}

function OrcamentoConfiguracoesPage({
	canManage,
	config = {},
	selectedPeriod = {},
}) {
	const [reportOpen, setReportOpen] = useState(false);
	const [feedback, setFeedback] = useState(null);
	return (
		<section className="space-y-5">
			<section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Relatório de gestão orçamentária
						</h2>
						<p className="mt-1 text-sm font-bold text-blue-900">
							Gere um PDF compacto usando os mesmos dados da Visão Geral, com
							seleção de blocos e período.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setReportOpen(true)}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700"
					>
						<Download size={16} /> Gerar Relatório
					</button>
				</div>
			</section>
			<CostCentersConfigSection canManage={canManage} />
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
			{reportOpen ? (
				<BudgetReportExportModal
					config={config}
					defaultPeriod={selectedPeriod}
					onClose={() => setReportOpen(false)}
				/>
			) : null}
		</section>
	);
}

function BudgetDataImportPage({ canManage, onConfigUpdated }) {
	const [dataState, setDataState] = useState(null);
	const [importJob, setImportJob] = useState(null);
	const [loading, setLoading] = useState(true);
	const [reading, setReading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [feedback, setFeedback] = useState(null);

	const loadBudgetData = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarDadosOrcamentoFinanceiro();
			setDataState(response.data || {});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível carregar os dados importados.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao carregar dados",
				...visibleError,
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBudgetData();
	}, [loadBudgetData]);

	const pollImportJob = useCallback(
		async (jobId) => {
			let keepPolling = true;
			while (keepPolling) {
				const response = await buscarImportacaoDadosOrcamentoFinanceiro(jobId);
				const job = response.job || {};
				setImportJob(job);
				setMessage(
					`${job.stage || "Processando"} · ${integer.format(job.percent || 0)}%`,
				);
				if (job.status === "completed") {
					setDataState(job.result?.data || {});
					setMessage(
						`Importação concluída: ${integer.format(job.result?.data?.summary?.totalRows || 0)} linha(s) salvas no histórico.`,
					);
					await onConfigUpdated?.({ silent: true });
					keepPolling = false;
					break;
				}
				if (job.status === "failed") {
					const visibleError = {
						message: job.error || "Falha ao importar dados orçamentários.",
						details: "",
					};
					setFeedback({
						type: "error",
						title: "Erro ao importar dados",
						...visibleError,
					});
					setMessage(visibleError.message);
					keepPolling = false;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 1200));
			}
			await loadBudgetData();
		},
		[loadBudgetData, onConfigUpdated],
	);

	const handleFileChange = async (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length) return;
		setReading(true);
		setSaving(true);
		setMessage("");
		try {
			const response = await iniciarImportacaoDadosOrcamentoFinanceiro(files);
			const job = response.job || {};
			setImportJob(job);
			setMessage(
				`Importação enviada: ${integer.format(files.length)} arquivo(s). Acompanhando processamento...`,
			);
			await pollImportJob(job.id);
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível enviar/importar o XLSX selecionado.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao importar XLSX",
				...visibleError,
			});
		} finally {
			setReading(false);
			setSaving(false);
			event.target.value = "";
		}
	};

	const clearImport = async () => {
		if (
			!canManage ||
			!window.confirm(
				"Zerar dados importados e a estrutura orçamentária gerada pela importação? A próxima planilha recriará contas, centros, empresas, filiais e fornecedores pelas regras atuais.",
			)
		)
			return;
		setSaving(true);
		setMessage("");
		try {
			const response = await limparDadosOrcamentoFinanceiro();
			setDataState(response.data || {});
			setImportJob(null);
			setMessage("Dados importados zerados. A próxima planilha recriará a estrutura orçamentária.");
			await onConfigUpdated?.({ silent: true });
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao limpar a leitura importada.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao limpar leitura",
				...visibleError,
			});
		} finally {
			setSaving(false);
		}
	};

	const summary = dataState?.summary || {};
	const importInfo = dataState?.importInfo || {};
	const savedRows = dataState?.rows || [];
	const activeFields = new Set(dataState?.detectedFields || []);
	const previewRows = savedRows.slice(0, 20);
	const importProgress = Math.max(0, Math.min(100, Number(importJob?.percent || 0)));
	const importRunning =
		importJob && ["queued", "running"].includes(importJob.status);

	return (
		<section className="space-y-5">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<Upload size={20} />
						</span>
						<div>
							<h2 className="text-lg font-black text-slate-950">
								Importador de dados XLSX
							</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Use a planilha orçamentária para gerar leitura, centro de custo,
								conta financeira, matriz anual, fornecedores e realizado.
							</p>
							<p className="mt-1 text-xs font-bold text-slate-500">
								Última importação: {formatUpdatedAt(importInfo.importedAt)} ·
								Arquivo: {importInfo.fileName || "-"} · Aba:{" "}
								{importInfo.sheetName || "-"}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<label
							className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 ${!canManage || reading || saving ? "pointer-events-none opacity-50" : ""}`}
						>
							{reading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Upload size={16} />
							)}{" "}
							Enviar XLSX
							<input
								type="file"
								accept=".xlsx"
								multiple
								className="hidden"
								disabled={!canManage || reading || saving}
								onChange={handleFileChange}
							/>
						</label>
						<button
							type="button"
							onClick={loadBudgetData}
							disabled={loading || saving}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
							Atualizar
						</button>
						<button
							type="button"
							onClick={clearImport}
							disabled={!canManage || saving || !savedRows.length}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
						>
							<Trash2 size={16} /> Zerar dados teste
						</button>
					</div>
				</div>

				{message ? (
					<div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
						{message}
					</div>
				) : null}

				{importJob ? (
					<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-sm font-black text-slate-950">
									{importJob.stage || "Processando importação"}
								</p>
								<p className="mt-1 text-xs font-bold text-slate-500">
									{integer.format(importJob.totalFiles || 0)} arquivo(s) ·{" "}
									{integer.format(importJob.totalRows || 0)} linha(s)
								</p>
							</div>
							<span className="text-sm font-black text-blue-700">
								{integer.format(importProgress)}%
							</span>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
							<div
								className={`h-full rounded-full ${importRunning ? "bg-blue-600" : importJob.status === "failed" ? "bg-red-500" : "bg-emerald-500"}`}
								style={{ width: `${importProgress}%` }}
							/>
						</div>
						{(importJob.fileReports || []).length ? (
							<div className="mt-3 grid gap-2 md:grid-cols-2">
								{importJob.fileReports.map((file, index) => (
									<div
										key={`${file.fileName}-${file.sheetName}-${index}`}
										className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
									>
										<span className="font-black text-slate-950">
											{file.fileName}
										</span>{" "}
										· {file.sheetName} · {file.layout} ·{" "}
										{integer.format(file.rows || 0)} linhas
									</div>
								))}
							</div>
						) : null}
					</div>
				) : null}

				<div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
					{[
						["Linhas", summary.totalRows || 0, "number"],
						["Orçado", summary.totalOrcado || 0, "currency"],
						["Realizado", summary.totalRealizado || 0, "currency"],
						["Contas", summary.uniqueAccounts || 0, "number"],
						["Centros", summary.uniqueCostCenters || 0, "number"],
						["Fornecedores", summary.uniqueSuppliers || 0, "number"],
						["Matrizes", summary.uniqueCompanies || 0, "number"],
						["Filiais", summary.uniqueBranches || 0, "number"],
					].map(([label, value, type]) => (
						<div key={label} className="rounded-2xl bg-slate-50 p-4">
							<p className="text-xs font-black uppercase text-slate-500">
								{label}
							</p>
							<p className="mt-1 min-w-0 break-words text-[clamp(0.95rem,1.2vw,1.25rem)] font-black leading-tight text-slate-950">
								{type === "currency"
									? brl.format(Number(value || 0))
									: integer.format(Number(value || 0))}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-base font-black text-slate-950">
						Campos esperados
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						A importação reconhece os cabeçalhos abaixo. Campos sem leitura
						ficam marcados para ajuste da planilha.
					</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{BUDGET_IMPORT_FIELDS.map((field) => (
							<div
								key={field.key}
								className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-black ${activeFields.has(field.key) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}
							>
								<span>{field.label}</span>
								<span>{activeFields.has(field.key) ? "Lido" : "Pendente"}</span>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h3 className="text-base font-black text-slate-950">
						Resumo por período
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						Esse resumo será usado para alimentar dashboard, realizado e
						desvios.
					</p>
					<div className="mt-4 max-h-96 overflow-auto rounded-2xl border border-slate-200">
						<table className="min-w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
								<tr>
									<th className="px-3 py-2">Período</th>
									<th className="px-3 py-2">Linhas</th>
									<th className="px-3 py-2">Orçado</th>
									<th className="px-3 py-2">Realizado</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{(summary.byMonth || []).length ? (
									summary.byMonth.map((row) => (
										<tr key={row.key}>
											<td className="px-3 py-2 font-black text-slate-900">
												{row.key}
											</td>
											<td className="px-3 py-2 font-bold text-slate-600">
												{integer.format(row.rows || 0)}
											</td>
											<td className="px-3 py-2 font-black text-slate-950">
												{brl.format(row.orcado || 0)}
											</td>
											<td className="px-3 py-2 font-black text-slate-950">
												{brl.format(row.realizado || 0)}
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={4}>
											<EmptyState text="Nenhum período importado ainda." />
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h3 className="text-base font-black text-slate-950">
							Prévia da leitura
						</h3>
						<p className="mt-1 text-xs font-bold text-slate-500">
							Mostrando até 20 linhas da planilha lida ou da última importação
							salva.
						</p>
					</div>
					{dataState?.appliedConfig ? (
						<p className="text-xs font-black text-blue-700">
							Criados/atualizados: {dataState.appliedConfig.accounts || 0}{" "}
							conta(s), {dataState.appliedConfig.centers || 0} centro(s),{" "}
							{dataState.appliedConfig.partners || 0} fornecedor(es),{" "}
							{dataState.appliedConfig.companies || 0} matriz(es),{" "}
							{dataState.appliedConfig.branches || 0} filial(is)
						</p>
					) : null}
				</div>
				<div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
					<table className="min-w-[1200px] divide-y divide-slate-200 text-xs">
						<thead className="bg-slate-50 text-left font-black uppercase text-slate-500">
							<tr>
								{BUDGET_IMPORT_FIELDS.slice(0, 14).map((field) => (
									<th key={field.key} className="px-3 py-2">
										{field.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{previewRows.length ? (
								previewRows.map((row, index) => (
									<tr key={`${row.seqMov || row.id || index}-${index}`}>
										{BUDGET_IMPORT_FIELDS.slice(0, 14).map((field) => (
											<td
												key={field.key}
												className="max-w-48 truncate px-3 py-2 font-bold text-slate-700"
												title={String(row[field.key] || "")}
											>
												{field.key === "orcado" || field.key === "realizado"
													? formatBudgetCurrency(row[field.key])
													: row[field.key] || "-"}
											</td>
										))}
									</tr>
								))
							) : (
								<tr>
									<td colSpan={14}>
										<EmptyState text="Leia um XLSX para visualizar a prévia." />
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
		</section>
	);
}

function SerasaReportPage({ canManage }) {
	const [report, setReport] = useState(null);
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState("");
	const [feedback, setFeedback] = useState(null);
	const currentDate = new Date();
	const [periodMode, setPeriodMode] = useState("month");
	const [monthMenuOpen, setMonthMenuOpen] = useState(false);
	const [yearMenuOpen, setYearMenuOpen] = useState(false);
	const [dateModalOpen, setDateModalOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [pageSize, setPageSize] = useState(50);
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedOperationIndex, setSelectedOperationIndex] = useState(null);
	const [reportModalOpen, setReportModalOpen] = useState(false);
	const [selectedReference, setSelectedReference] = useState({
		referenceYear: currentDate.getFullYear(),
		referenceMonth: currentDate.getMonth() + 1,
	});
	const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });

	const loadSerasa = useCallback(async () => {
		setLoading(true);
		try {
			const response = await buscarSerasaReportFinanceiro();
			setReport(response.data || {});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao carregar Serasa",
				...getVisibleError(
					error,
					"Não foi possível carregar o report Serasa.",
				),
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSerasa();
	}, [loadSerasa]);

	const handleUpload = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setAction("upload");
		try {
			const buffer = await file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
			const sheetName =
				workbook.SheetNames.find((name) =>
					/MOVIMENTA[CÇ][AÃ]O SERASA/i.test(name),
				) || workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const clientCount = extractWorksheetNumberCell(worksheet, "P5");
			const rawRows = XLSX.utils.sheet_to_json(worksheet, {
				raw: false,
				defval: "",
			});
			const rows = normalizeSerasaUploadRows(rawRows);
			const response = await salvarSerasaReportFinanceiro({
				fileName: file.name,
				sheetName,
				rows,
				clientCount,
			});
			setReport(response.data || {});
			setFeedback({
				type: "success",
				title: "Leitura Serasa concluída",
				message: `${integer.format(response.data?.summary?.totalRows || 0)} movimentação(ões) importada(s).`,
				details: `Arquivo: ${file.name}\nAba: ${sheetName}`,
			});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro na leitura Serasa",
				...getVisibleError(
					error,
					"Não foi possível ler/importar a planilha Serasa.",
				),
			});
		} finally {
			setAction("");
			event.target.value = "";
		}
	};

	const handleForceSync = async () => {
		setAction("sync");
		try {
			const response = await sincronizarPlanilhasFinanceiro({ sourceId: "serasa" });
			await loadSerasa();
			setFeedback({
				type: response.ok ? "success" : "error",
				title: response.ok ? "Atualização forçada" : "Atualização com falhas",
				message:
					response.message ||
					"Leitura automática das planilhas financeiras concluída.",
				details: (response.results || [])
					.filter((item) => item.sourceId === "serasa")
					.map(
						(item) =>
							`${item.label}: ${item.status} · ${integer.format(item.totalRows || 0)} linha(s)${
								item.message ? ` · ${item.message}` : ""
							}`,
					)
					.join("\n"),
			});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao forçar atualização",
				...getVisibleError(
					error,
					"Não foi possível forçar a atualização do Serasa.",
				),
			});
		} finally {
			setAction("");
		}
	};

	const handleClearSerasa = async () => {
		if (
			!canManage ||
			!window.confirm(
				"Zerar somente os dados importados do Serasa? A configuração da planilha será mantida.",
			)
		)
			return;
		setAction("clear");
		try {
			const response = await limparSerasaReportFinanceiro();
			setReport(response.data || {});
			setFeedback({
				type: "success",
				title: "Dados Serasa zerados",
				message:
					"Os dados importados do Serasa foram limpos. A configuração da origem foi mantida.",
			});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao zerar Serasa",
				...getVisibleError(error, "Não foi possível zerar os dados Serasa."),
			});
		} finally {
			setAction("");
		}
	};

	const applyDateRange = (nextRange = {}) => {
		setDateRange({
			startDate: nextRange.startDate || "",
			endDate: nextRange.endDate || "",
		});
		setSelectedReference((current) => ({
			...current,
			referenceYear:
				Number(String(nextRange.startDate || "").slice(0, 4)) ||
				current.referenceYear,
		}));
		setPeriodMode("custom");
		setDateModalOpen(false);
	};

	const rows = report?.rows || EMPTY_SERASA_LIST;
	const clientesHistory = report?.clientesHistory || EMPTY_SERASA_LIST;
	const yearOptions = Array.from({ length: 7 }, (_, index) => 2026 - index);
	const selectedPeriod = useMemo(
		() => ({
			mode: periodMode,
			...dateRange,
			...selectedReference,
		}),
		[dateRange, periodMode, selectedReference],
	);
	const periodLabel = useMemo(
		() => formatSerasaPeriodLabel(selectedPeriod),
		[selectedPeriod],
	);
	const periodRows = useMemo(
		() =>
			dedupeSerasaRows(
				rows.filter(
					(row) =>
						serasaRowMatchesPeriod(row, selectedPeriod) &&
						!isSerasaClientMarker(row),
				),
			),
		[rows, selectedPeriod],
	);
	useEffect(() => {
		setCurrentPage(1);
	}, [periodMode, selectedReference, dateRange, searchTerm, pageSize]);
	const filteredRows = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		if (!term) return periodRows;
		return periodRows.filter((row) =>
			[row.description, row.operation, row.type]
				.join(" ")
				.toLowerCase()
				.includes(term),
		);
	}, [periodRows, searchTerm]);
	const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
	const paginatedRows = filteredRows.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const periodData = useMemo(
		() => summarizeSerasaRows(periodRows, clientesHistory, selectedPeriod),
		[clientesHistory, periodRows, selectedPeriod],
	);
	const summary = periodData.summary;
	const monthly = periodData.monthly;
	const operationTotals = periodData.operationTotals;
	const monthlyChart = useMemo(
		() => ({
			labels: monthly.map((item) => item.label),
			datasets: [
				{
					label: "Entradas",
					data: monthly.map((item) => Number(item.entradas || 0)),
					backgroundColor: "#10b981",
					borderRadius: 8,
				},
				{
					label: "Saídas",
					data: monthly.map((item) => Number(item.saidas || 0)),
					backgroundColor: "#ef4444",
					borderRadius: 8,
				},
				{
					label: "Receita líquida",
					data: monthly.map((item) => Number(item.receitaLiquida || 0)),
					backgroundColor: "#2563eb",
					borderRadius: 8,
				},
			],
		}),
		[monthly],
	);
	const clientTrend = useMemo(() => {
		const filtered = clientesHistory
			.filter((item) => serasaClientHistoryMatchesPeriod(item, selectedPeriod))
			.sort((a, b) => String(a.key || "").localeCompare(String(b.key || "")));
		if (filtered.length) return filtered;
		return summary.clientes
			? [
					{
						key: periodLabel,
						label: periodLabel,
						clientes: summary.clientes,
					},
				]
			: [];
	}, [clientesHistory, periodLabel, selectedPeriod, summary.clientes]);
	const clientsChart = useMemo(
		() => ({
			labels: clientTrend.map((item) => item.label || item.key),
			datasets: [
				{
					label: "Clientes Base",
					data: clientTrend.map((item) => Number(item.clientes || 0)),
					borderColor: "#7c3aed",
					backgroundColor: "rgba(124,58,237,0.14)",
					borderWidth: 3,
					pointRadius: 4,
					fill: true,
					tension: 0.35,
				},
			],
		}),
		[clientTrend],
	);
	const clientsChartOptions = useMemo(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					display: true,
					labels: { boxWidth: 10, font: { weight: "bold" } },
				},
				tooltip: {
					callbacks: {
						label: (context) =>
							`${context.dataset.label}: ${integer.format(Number(context.raw || 0))}`,
					},
				},
			},
			scales: {
				x: { grid: { display: false } },
				y: {
					ticks: { callback: (value) => integer.format(Number(value)) },
					suggestedMin: 0,
				},
			},
		}),
		[],
	);
	const operationChart = useMemo(
		() => ({
			labels: operationTotals.map((item) => item.label),
			datasets: [
				{
					data: operationTotals.map((item) => item.value),
					backgroundColor: [
						"#2563eb",
						"#10b981",
						"#f97316",
						"#8b5cf6",
						"#ef4444",
						"#64748b",
					],
					borderWidth: 0,
				},
			],
		}),
		[operationTotals],
	);
	useEffect(() => {
		if (!operationTotals.length) {
			setSelectedOperationIndex(null);
			return;
		}
		setSelectedOperationIndex((current) =>
			Number.isInteger(current) && operationTotals[current] ? current : 0,
		);
	}, [operationTotals]);
	const selectedOperation = Number.isInteger(selectedOperationIndex)
		? operationTotals[selectedOperationIndex]
		: null;
	const operationCenterLabel = selectedOperation?.label || "Selecione";
	const operationCenterValue = Number(selectedOperation?.value || 0);
	const selectOperationFromChart = (_event, elements = []) => {
		const nextIndex = elements?.[0]?.index;
		if (Number.isInteger(nextIndex)) setSelectedOperationIndex(nextIndex);
	};
	const periodSelector = (
		<div className="-mt-4 flex justify-end">
			<div className="relative flex rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="relative">
					<button
						type="button"
						onClick={() => {
							setPeriodMode("month");
							setYearMenuOpen(false);
							setMonthMenuOpen((current) => !current);
						}}
						className={`min-h-11 rounded-l-xl px-5 text-sm font-bold ${periodMode === "month" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
					>
						{periodMode === "month" ? periodLabel : "Mês"}
					</button>
					{monthMenuOpen ? (
						<div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
							<p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase text-slate-500">
								{selectedReference.referenceYear}
							</p>
							<div className="grid grid-cols-2 gap-1">
								{Array.from({ length: 12 }, (_, index) => {
									const month = index + 1;
									const active =
										Number(selectedReference.referenceMonth) === month &&
										periodMode === "month";
									return (
										<button
											key={month}
											type="button"
											onClick={() => {
												setSelectedReference((current) => ({
													...current,
													referenceMonth: month,
												}));
												setPeriodMode("month");
												setMonthMenuOpen(false);
											}}
											className={`rounded-xl px-3 py-2 text-left text-xs font-black ${active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
										>
											{budgetMonthName(month)}
										</button>
									);
								})}
							</div>
						</div>
					) : null}
				</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => {
							setPeriodMode("year");
							setMonthMenuOpen(false);
							setYearMenuOpen((current) => !current);
						}}
						className={`min-h-11 border-l border-slate-200 px-5 text-sm font-bold ${periodMode === "year" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
					>
						Ano
					</button>
					{yearMenuOpen ? (
						<div className="absolute right-0 top-[calc(100%+8px)] z-40 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
							{yearOptions.map((year) => (
								<button
									key={year}
									type="button"
									onClick={() => {
										setSelectedReference((current) => ({
											...current,
											referenceYear: year,
										}));
										setPeriodMode("year");
										setYearMenuOpen(false);
									}}
									className={`block w-full rounded-xl px-3 py-2 text-left text-xs font-black ${Number(selectedReference.referenceYear) === year && periodMode === "year" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
								>
									{year}
								</button>
							))}
						</div>
					) : null}
				</div>
				<button
					type="button"
					onClick={() => {
						setMonthMenuOpen(false);
						setYearMenuOpen(false);
						setDateModalOpen(true);
					}}
					className={`min-h-11 rounded-r-xl border-l border-slate-200 px-5 text-sm font-bold ${periodMode === "custom" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Datas
				</button>
			</div>
		</div>
	);

	return (
		<section className="space-y-5">
			{periodSelector}
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Dashboard Serasa
						</h2>
						<p className="mt-1 text-sm font-bold text-slate-500">
							Aba MOVIMENTAÇÃO SERASA · Período: {periodLabel}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<label
							className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 ${!canManage || action ? "pointer-events-none opacity-50" : ""}`}
						>
							{action === "upload" ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Upload size={16} />
							)}
							Ler XLSX Serasa
							<input
								type="file"
								accept=".xlsx"
								className="hidden"
								disabled={!canManage || Boolean(action)}
								onChange={handleUpload}
							/>
						</label>
						<button
							type="button"
							onClick={handleForceSync}
							disabled={loading || Boolean(action)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={action === "sync" ? "animate-spin" : ""}
							/>
							Forçar atualização
						</button>
						<button
							type="button"
							onClick={loadSerasa}
							disabled={loading || Boolean(action)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
							Atualizar
						</button>
						<button
							type="button"
							onClick={() => setReportModalOpen(true)}
							disabled={loading || Boolean(action) || !periodRows.length}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
						>
							<Download size={16} />
							Gerar Relatório
						</button>
						<span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500">
							<CalendarClock size={16} className="text-slate-700" />
							<span>
								<span className="block leading-tight">Última atualização</span>
								<span className="block text-sm text-slate-950">
									{formatUpdatedAt(report?.importInfo?.importedAt)}
								</span>
							</span>
						</span>
						<button
							type="button"
							onClick={handleClearSerasa}
							disabled={!canManage || loading || Boolean(action) || !rows.length}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
						>
							<Trash2 size={16} />
							Zerar dados
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{SERASA_KPI_CONFIG.map((item, index) => (
					<FinancialKpiCard
						key={item.id}
						index={index}
						loading={loading}
						compact
						centered
						item={{
							id: item.id,
							title: item.title,
							value: summary[item.id] || 0,
							type: item.type || "currency",
							icon: item.icon,
							color: item.color,
						}}
					/>
				))}
			</section>

			<section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
				<div className="grid gap-4">
					<ChartCard title="Evolução mensal Serasa" empty={!monthly.length}>
						<Bar data={monthlyChart} options={barOptions()} />
					</ChartCard>
					<ChartCard
						title="Evolução mensal Clientes Base"
						empty={!clientTrend.length}
					>
						<Line data={clientsChart} options={clientsChartOptions} />
					</ChartCard>
				</div>
				<ChartCard
					title="Concentração por operação"
					empty={!operationTotals.length}
				>
					<Doughnut
						data={operationChart}
						options={{
							responsive: true,
							maintainAspectRatio: false,
							cutout: "62%",
							onClick: selectOperationFromChart,
							onHover: (event, elements) => {
								event.native.target.style.cursor = elements.length ? "pointer" : "default";
							},
							plugins: {
								legend: {
									position: "bottom",
									labels: { boxWidth: 10, font: { weight: "bold" } },
								},
								tooltip: {
									callbacks: {
										label: (ctx) =>
											`${ctx.label}: ${brl.format(Number(ctx.raw || 0))}`,
									},
								},
								centerText: {
									title: operationCenterLabel,
									value: brl.format(operationCenterValue),
									maxWidth: 130,
								},
							},
						}}
					/>
				</ChartCard>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h3 className="text-lg font-black text-slate-950">
							Movimentações Serasa
						</h3>
						<p className="mt-1 text-xs font-bold text-slate-500">
							{integer.format(filteredRows.length)} registro(s) em {periodLabel}
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<label className="relative block">
							<Search
								size={16}
								className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
							/>
							<input
								value={searchTerm}
								onChange={(event) => setSearchTerm(event.target.value)}
								placeholder="Buscar nome ou operação"
								className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
							/>
						</label>
						<select
							value={pageSize}
							onChange={(event) => setPageSize(Number(event.target.value))}
							className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						>
							{[50, 100, 150, 200].map((option) => (
								<option key={option} value={option}>
									{option} por página
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
					<table className="w-full table-fixed divide-y divide-slate-200 text-left text-xs font-bold">
						<thead className="bg-slate-50 text-slate-500">
							<tr>
								<th className="w-[110px] px-3 py-2">Data</th>
								<th className="w-[130px] px-3 py-2">Tipo</th>
								<th className="px-3 py-2">Descrição</th>
								<th className="w-[180px] px-3 py-2">Operação</th>
								<th className="w-[150px] px-3 py-2 text-right">Valor</th>
								<th className="w-[150px] px-3 py-2">Classificação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{paginatedRows.length ? (
								paginatedRows.map((row) => (
									<tr key={row.id}>
										<td className="px-3 py-2 text-slate-600">{row.date}</td>
										<td className="truncate px-3 py-2 text-slate-600" title={row.type}>
											{row.type}
										</td>
										<td className="truncate px-3 py-2 font-black text-slate-950" title={row.description || ""}>
											{row.description || "-"}
										</td>
										<td className="truncate px-3 py-2 text-slate-600" title={row.operation || ""}>
											{row.operation || "-"}
										</td>
										<td
											className={`px-3 py-2 text-right font-black ${
												isSerasaNetRevenue(row)
													? "text-blue-700"
													: Number(row.value || 0) < 0
														? "text-red-700"
														: "text-emerald-700"
											}`}
										>
											{brl.format(Number(row.value || 0))}
										</td>
										<td className="px-3 py-2">
											<span
												className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${
													isSerasaNetRevenue(row)
														? "bg-blue-50 text-blue-700"
														: Number(row.value || 0) < 0
															? "bg-red-50 text-red-700"
															: "bg-emerald-50 text-emerald-700"
												}`}
											>
												{isSerasaNetRevenue(row)
													? "Receita líquida"
													: Number(row.value || 0) < 0
														? "Saída"
														: "Entrada"}
											</span>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6}>
										<EmptyState text="Nenhuma movimentação Serasa encontrada para os filtros atuais." />
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs font-bold text-slate-500">
						Página {integer.format(currentPage)} de {integer.format(totalPages)}
					</p>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
							disabled={currentPage <= 1}
							className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							onClick={() =>
								setCurrentPage((page) => Math.min(totalPages, page + 1))
							}
							disabled={currentPage >= totalPages}
							className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>
			{reportModalOpen ? (
				<SerasaReportExportModal
					periodLabel={periodLabel}
					summary={summary}
					monthly={monthly}
					clientTrend={clientTrend}
					operationTotals={operationTotals}
					rows={periodRows}
					importInfo={report?.importInfo || {}}
					onClose={() => setReportModalOpen(false)}
				/>
			) : null}
			{dateModalOpen ? (
				<BudgetDateRangeModal
					value={dateRange}
					onClose={() => setDateModalOpen(false)}
					onApply={applyDateRange}
				/>
			) : null}
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
		</section>
	);
}

function BankBadge({ item = {} }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white shadow-sm"
				style={{ backgroundColor: item.bankColor || "#0f766e" }}
			>
				{item.bankInitials || String(item.label || item.bank || "?").slice(0, 2)}
			</span>
			<span className="truncate">{item.label || item.bank || item.method || "-"}</span>
		</span>
	);
}

function TariffsYearSelector({ year, years = [], onChange }) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<span className="text-xs font-black uppercase text-slate-400">Ano</span>
			<select
				value={year}
				onChange={(event) => onChange(Number(event.target.value))}
				className="min-h-11 rounded-xl border border-orange-200 bg-white px-4 text-sm font-black text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
			>
				{years.map((item) => (
					<option key={item} value={item}>
						{item}
					</option>
				))}
			</select>
		</div>
	);
}

function TariffsDetailPage({ type = "faturas" }) {
	const [report, setReport] = useState(null);
	const [loading, setLoading] = useState(true);
	const [feedback, setFeedback] = useState(null);
	const loadTariffs = useCallback(async () => {
		setLoading(true);
		try {
			const response = await buscarTarifasReportFinanceiro();
			setReport(response.data || {});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao carregar Tarifas",
				...getVisibleError(error, "Não foi possível carregar os dados de Tarifas."),
			});
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		loadTariffs();
	}, [loadTariffs]);
	const years = useMemo(
		() => getTariffsDetailAvailableYears(report || {}),
		[report],
	);
	const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
	const [selectedMonth, setSelectedMonth] = useState(0);
	const [searchTerm, setSearchTerm] = useState("");
	const [pageSize, setPageSize] = useState(50);
	const [pageIndex, setPageIndex] = useState(1);
	const [selectedInvoiceMetricIndex, setSelectedInvoiceMetricIndex] =
		useState(null);
	useEffect(() => {
		if (!years.includes(selectedYear)) setSelectedYear(years[0]);
	}, [selectedYear, years]);
	const viewModel = useMemo(() => {
		const builder =
			TARIFFS_DETAIL_BUILDERS[type] || TARIFFS_DETAIL_BUILDERS.faturas;
		return builder({
			report: report || {},
			year: selectedYear,
			month: selectedMonth,
			searchTerm,
			pageIndex,
			pageSize,
			selectedInvoiceMetricIndex,
		});
	}, [
		pageIndex,
		pageSize,
		report,
		searchTerm,
		selectedInvoiceMetricIndex,
		selectedMonth,
		selectedYear,
		type,
	]);
	const selectInvoiceMetricFromChart = (_, elements = []) => {
		if (type !== "faturas") return;
		const nextIndex = elements[0]?.index;
		setSelectedInvoiceMetricIndex(
			Number.isInteger(nextIndex) ? nextIndex : null,
		);
	};
	useEffect(() => {
		setPageIndex(1);
		setSelectedInvoiceMetricIndex(null);
	}, [searchTerm, selectedMonth, selectedYear, type]);
	return (
		<TariffsDetailLayout
			feedbackModal={
				<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
			}
			filters={{
				month: selectedMonth,
				onMonthChange: setSelectedMonth,
				onRefresh: loadTariffs,
				onYearChange: setSelectedYear,
				year: selectedYear,
				years,
			}}
			loading={loading}
			onSelectInvoiceMetric={selectInvoiceMetricFromChart}
			pagination={{
				pageSize,
				onPageChange: setPageIndex,
				onPageSizeChange: setPageSize,
			}}
			search={{
				value: searchTerm,
				onChange: setSearchTerm,
			}}
			viewModel={viewModel}
		/>
	);
}

function TariffsReportPage({ canManage }) {
	const {
		action,
		applyDateRange,
		dateModalOpen,
		dateRange,
		feedback,
		handleClear,
		handleUpload,
		insights,
		loadTariffs,
		loading,
		monthMenuOpen,
		monthlyTariffsChart,
		openDateRangeModal,
		openReportModal,
		paymentChart,
		periodLabel,
		periodMode,
		report,
		reportModalOpen,
		closeDateRangeModal,
		closeFeedback,
		closeReportModal,
		selectMonth,
		selectYear,
		toggleMonthMenu,
		toggleYearMenu,
		yearMenuOpen,
	} = useTariffsReport({ canManage, getVisibleError });
	const yearOptions = Array.from({ length: 7 }, (_, index) => 2026 - index);
	return (
		<section className="space-y-4">
			<TariffsPeriodSelector
				monthMenuOpen={monthMenuOpen}
				onDateClick={openDateRangeModal}
				onMonthSelect={selectMonth}
				onMonthToggle={toggleMonthMenu}
				onYearSelect={selectYear}
				onYearToggle={toggleYearMenu}
				periodLabel={periodLabel}
				periodMode={periodMode}
				yearMenuOpen={yearMenuOpen}
				yearOptions={yearOptions}
			/>
			<TariffsUploadActions
				action={action}
				canManage={canManage}
				lastUpdatedLabel={formatUpdatedAt(report?.importInfo?.importedAt)}
				loading={loading}
				onClear={handleClear}
				onOpenReport={openReportModal}
				onRefresh={loadTariffs}
				onUpload={handleUpload}
				report={report}
			/>
			<TariffsOverviewKpis insights={insights} loading={loading} />
			<TariffsOverviewCharts
				insights={insights}
				monthlyTariffsChart={monthlyTariffsChart}
				paymentChart={paymentChart}
			/>
			<TariffsDetectedBlocks report={report} />
			{reportModalOpen ? (
				<TariffsReportExportModal
					periodLabel={periodLabel}
					insights={insights}
					importInfo={report?.importInfo || {}}
					onClose={closeReportModal}
				/>
			) : null}
			{dateModalOpen ? (
				<BudgetDateRangeModal
					value={dateRange}
					onClose={closeDateRangeModal}
					onApply={applyDateRange}
				/>
			) : null}
			<FeedbackModal feedback={feedback} onClose={closeFeedback} />
		</section>
	);
}

function BudgetPeriodSelector({
	budgetMonthMenuOpen,
	budgetMonthSelectorYear,
	budgetPeriodMode,
	budgetYearMenuOpen,
	budgetYearOptions,
	selectedBudgetReference,
	setBudgetDateModalOpen,
	setBudgetMonthMenuOpen,
	setBudgetMonthOverride,
	setBudgetPeriodMode,
	setBudgetYearMenuOpen,
}) {
	const closeMenus = () => {
		setBudgetMonthMenuOpen(false);
		setBudgetYearMenuOpen(false);
	};
	return (
		<div className="relative flex rounded-xl border border-slate-200">
			<div className="relative">
				<button
					type="button"
					onClick={() => {
						setBudgetPeriodMode("month");
						setBudgetYearMenuOpen(false);
						setBudgetMonthMenuOpen((current) => !current);
					}}
					className={`min-h-11 rounded-l-xl px-5 text-sm font-bold ${budgetPeriodMode === "month" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Mês
				</button>
				{budgetMonthMenuOpen ? (
					<div className="absolute left-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
						<p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
							{budgetMonthSelectorYear}
						</p>
						<div className="grid grid-cols-2 gap-1">
							{Array.from({ length: 12 }, (_, index) => index + 1).map(
								(month) => {
									const activeMonth =
										Number(selectedBudgetReference.referenceMonth || 0) ===
											month && budgetPeriodMode === "month";
									return (
										<button
											key={month}
											type="button"
											onClick={() => {
												setBudgetMonthOverride({
													referenceYear: budgetMonthSelectorYear,
													referenceMonth: month,
												});
												setBudgetPeriodMode("month");
												closeMenus();
											}}
											className={`rounded-xl px-3 py-2 text-left text-xs font-black ${activeMonth ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
										>
											{budgetMonthName(month)}
										</button>
									);
								},
							)}
						</div>
					</div>
				) : null}
			</div>
			<div className="relative">
				<button
					type="button"
					onClick={() => {
						setBudgetPeriodMode("year");
						setBudgetMonthMenuOpen(false);
						setBudgetYearMenuOpen((current) => !current);
					}}
					className={`min-h-11 border-l border-slate-200 px-5 text-sm font-bold ${budgetPeriodMode === "year" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Ano
				</button>
				{budgetYearMenuOpen ? (
					<div className="absolute left-0 top-[calc(100%+8px)] z-40 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
						<p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
							Ano
						</p>
						<div className="grid gap-1">
							{budgetYearOptions.map((year) => {
								const activeYear =
									Number(selectedBudgetReference.referenceYear || 0) === year &&
									budgetPeriodMode === "year";
								return (
									<button
										key={year}
										type="button"
										onClick={() => {
											setBudgetMonthOverride({
												referenceYear: year,
												referenceMonth:
													selectedBudgetReference.referenceMonth || 1,
											});
											setBudgetPeriodMode("year");
											closeMenus();
										}}
										className={`rounded-xl px-3 py-2 text-left text-xs font-black ${activeYear ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
									>
										{year}
									</button>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
			<button
				type="button"
				onClick={() => {
					closeMenus();
					setBudgetDateModalOpen(true);
				}}
				className={`min-h-11 rounded-r-xl border-l border-slate-200 px-5 text-sm font-bold ${budgetPeriodMode === "custom" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
			>
				Datas
			</button>
		</div>
	);
}

function GeneralPeriodSelector({ period, setPeriod }) {
	return (
		<div className="flex overflow-hidden rounded-xl border border-slate-200">
			{["month", "year"].map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => setPeriod(option)}
					className={`min-h-11 px-5 text-sm font-bold ${period === option ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					{option === "month" ? "Mês" : "Ano"}
				</button>
			))}
		</div>
	);
}

function FinanceiroPageHeader({
	budgetConfig,
	budgetLoading,
	budgetMonthMenuOpen,
	budgetMonthSelectorYear,
	budgetPeriodDisplayLabel,
	budgetPeriodMode,
	budgetYearMenuOpen,
	budgetYearOptions,
	data,
	hideHeaderControls,
	isBudgetOperationalPage,
	isCompactReportPage,
	load,
	loadBudgetConfig,
	loading,
	meta,
	onOpenDirectoratesConfig,
	page,
	period,
	selectedBudgetReference,
	setBudgetDateModalOpen,
	setBudgetMonthMenuOpen,
	setBudgetMonthOverride,
	setBudgetPeriodMode,
	setBudgetYearMenuOpen,
	setExportModalOpen,
	setPeriod,
}) {
	const refreshLoading = isBudgetOperationalPage ? budgetLoading : loading;
	return (
		<header>
			<div
				className={`flex flex-col xl:flex-row xl:items-center xl:justify-between ${
					isCompactReportPage ? "gap-2" : "gap-4"
				}`}
			>
				<div>
					<h1
						className={`font-extrabold text-slate-950 ${
							isCompactReportPage ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"
						}`}
					>
						{meta.title}
					</h1>
					<p
						className={`font-semibold text-slate-600 ${
							isCompactReportPage ? "mt-0 text-sm" : "mt-1 text-base"
						}`}
					>
						{meta.subtitle}
					</p>
				</div>
				{hideHeaderControls ? null : (
					<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
						<span className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-500">
							<CalendarClock size={18} className="text-slate-700" />
							<span>
								<span className="block leading-tight">
									{isBudgetOperationalPage
										? "Última importação:"
										: "Última atualização:"}
								</span>
								<span className="block text-sm text-slate-950">
									{formatUpdatedAt(
										isBudgetOperationalPage
											? budgetConfig?.lastImportInfo?.importedAt
											: data?.updatedAt,
									)}
								</span>
								{isBudgetOperationalPage ? (
									<span className="block text-[11px] font-black text-blue-700">
										{budgetPeriodDisplayLabel}
									</span>
								) : null}
							</span>
						</span>
						{isBudgetOperationalPage ? (
							<BudgetPeriodSelector
								budgetMonthMenuOpen={budgetMonthMenuOpen}
								budgetMonthSelectorYear={budgetMonthSelectorYear}
								budgetPeriodMode={budgetPeriodMode}
								budgetYearMenuOpen={budgetYearMenuOpen}
								budgetYearOptions={budgetYearOptions}
								selectedBudgetReference={selectedBudgetReference}
								setBudgetDateModalOpen={setBudgetDateModalOpen}
								setBudgetMonthMenuOpen={setBudgetMonthMenuOpen}
								setBudgetMonthOverride={setBudgetMonthOverride}
								setBudgetPeriodMode={setBudgetPeriodMode}
								setBudgetYearMenuOpen={setBudgetYearMenuOpen}
							/>
						) : (
							<GeneralPeriodSelector period={period} setPeriod={setPeriod} />
						)}
						{page === "dashboard" ? (
							<button
								type="button"
								onClick={() => setExportModalOpen(true)}
								disabled={loading || !data}
								className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
							>
								<Download size={16} /> Exportar
							</button>
						) : null}
						<button
							type="button"
							onClick={isBudgetOperationalPage ? () => loadBudgetConfig() : load}
							disabled={refreshLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={refreshLoading ? "animate-spin" : ""}
							/>{" "}
							Atualizar
						</button>
						{page === "orcamentoDashboard" ? (
							<button
								type="button"
								onClick={onOpenDirectoratesConfig}
								disabled={refreshLoading}
								className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								title="Configurar diretores do ranking"
								aria-label="Configurar diretores do ranking"
							>
								<Settings size={16} />
							</button>
						) : null}
					</div>
				)}
			</div>
		</header>
	);
}

function FinanceiroPageContent({
	budgetConfig,
	budgetDateRange,
	budgetLoading,
	budgetPeriodMode,
	canManage,
	canManageEquipe,
	data,
	exportModalOpen,
	loading,
	loadBudgetConfig,
	onOpenDirectoratesConfig,
	page,
	period,
	selectedBudgetReference,
	setBudgetConfig,
	setExportModalOpen,
}) {
	const selectedPeriod = {
		mode: budgetPeriodMode,
		...budgetDateRange,
		...selectedBudgetReference,
	};
	const tariffDetailTypes = {
		reportsTarifasFaturas: "faturas",
		reportsTarifasRecCliente: "recCliente",
		reportsTarifasFormasPagamento: "formasPagamento",
	};
	return (
		<>
			{page === "dashboard" ? (
				<DashboardContent data={data} loading={loading} />
			) : null}
			{exportModalOpen ? (
				<ExportFinanceiroModal
					data={data}
					period={period}
					onClose={() => setExportModalOpen(false)}
				/>
			) : null}
			{["contasPagar", "contasReceber", "faturamento", "notas"].includes(
				page,
			) ? (
				<SectionPage page={page} />
			) : null}
			{page === "reportsSerasa" ? (
				<SerasaReportPage canManage={canManage} />
			) : null}
			{page === "reportsTarifas" ? (
				<TariffsReportPage canManage={canManage} />
			) : null}
			{tariffDetailTypes[page] ? (
				<TariffsDetailPage type={tariffDetailTypes[page]} />
			) : null}
			{[
				"orcamentoDashboard",
				"orcamentoCentrosCusto",
				"orcamentoDre",
				"orcamentoAprovacoes",
			].includes(page) ? (
				<BudgetOperationalPage
					page={page}
					config={budgetConfig || {}}
					loading={budgetLoading}
					canManage={canManage}
					onConfigUpdated={setBudgetConfig}
					onOpenDirectoratesConfig={onOpenDirectoratesConfig}
					selectedPeriod={selectedPeriod}
				/>
			) : null}
			{page === "orcamentoDados" ? (
				<BudgetDataImportPage
					canManage={canManage}
					onConfigUpdated={loadBudgetConfig}
				/>
			) : null}
			{page === "orcamentoConfiguracoes" ? (
				<OrcamentoConfiguracoesPage
					canManage={canManage}
					config={budgetConfig || {}}
					selectedPeriod={selectedPeriod}
				/>
			) : null}
			{page === "configuracoes" ? (
				<ConfiguracoesPage canManage={canManage} />
			) : null}
			{page === "equipe" ? (
				<FinanceiroEquipePage canManage={canManageEquipe} />
			) : null}
		</>
	);
}

const MemoizedFinanceiroPageHeader = memo(FinanceiroPageHeader);
const MemoizedFinanceiroPageContent = memo(FinanceiroPageContent);

export default function FinanceiroPage({ page = "dashboard" }) {
	const { currentUser } = useAuthContext();
	const [period, setPeriod] = useState("month");
	const [budgetPeriodMode, setBudgetPeriodMode] = useState("month");
	const [budgetMonthMenuOpen, setBudgetMonthMenuOpen] = useState(false);
	const [budgetYearMenuOpen, setBudgetYearMenuOpen] = useState(false);
	const [budgetMonthOverride, setBudgetMonthOverride] = useState(null);
	const [budgetDateRange, setBudgetDateRange] = useState({
		startDate: "",
		endDate: "",
	});
	const [budgetDateModalOpen, setBudgetDateModalOpen] = useState(false);
	const [data, setData] = useState(null);
	const [budgetConfig, setBudgetConfig] = useState(null);
	const [budgetLoading, setBudgetLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [exportModalOpen, setExportModalOpen] = useState(false);
	const [directoratesConfigOpen, setDirectoratesConfigOpen] = useState(false);
	const [directoratesConfigSaving, setDirectoratesConfigSaving] = useState(false);
	const [message, setMessage] = useState("");
	const meta = PAGE_META[page] || PAGE_META.dashboard;
	const canManage =
		hasPermission(currentUser, "financeiro.configuracoes.manage") ||
		hasPermission(currentUser, "financeiro.gestao_orcamento.manage");
	const canManageEquipe = hasPermission(currentUser, "financeiro.equipe.manage");
	const {
		hideHeaderControls,
		isBudgetOperationalPage,
		isBudgetPage,
		isCompactReportPage,
	} = getFinanceiroPageFlags(page);
	const budgetReference = getBudgetReference(budgetConfig);
	const selectedBudgetReference = budgetMonthOverride || budgetReference;
	const budgetMonthSelectorYear = getBudgetMonthSelectorYear(
		selectedBudgetReference,
		budgetReference,
	);
	const budgetYearOptions = Array.from(
		{ length: 7 },
		(_, index) => 2026 - index,
	);
	const budgetPeriodDisplayLabel = isBudgetOperationalPage
		? buildBudgetPeriod({
				mode: budgetPeriodMode,
				...budgetDateRange,
				...selectedBudgetReference,
			}).displayLabel
		: "";

	const load = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarDashboardFinanceiro({ period });
			setData(response.data);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível carregar os dados financeiros.",
			);
		} finally {
			setLoading(false);
		}
	}, [period]);

	const loadBudgetConfig = useCallback(async ({ silent = false } = {}) => {
		if (!silent) setBudgetLoading(true);
		try {
			const response = await buscarCentrosCustoOrcamentoFinanceiro();
			const nextConfig = response.config || {};
			setBudgetConfig(nextConfig);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível carregar a gestão orçamentária.",
			);
		} finally {
			if (!silent) setBudgetLoading(false);
		}
	}, []);

	const saveDirectoratesConfig = async (nextConfig) => {
		setDirectoratesConfigSaving(true);
		try {
			const response = await salvarCentrosCustoOrcamentoFinanceiro(nextConfig);
			setBudgetConfig(response.config || nextConfig);
			setDirectoratesConfigOpen(false);
			setMessage("Diretores do ranking atualizados com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar os diretores.");
		} finally {
			setDirectoratesConfigSaving(false);
		}
	};
	const openDirectoratesConfig = useCallback(() => {
		setDirectoratesConfigOpen(true);
	}, []);
	const closeDirectoratesConfig = useCallback(() => {
		setDirectoratesConfigOpen(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (isBudgetPage) {
			loadBudgetConfig({ silent: page === "orcamentoConfiguracoes" }).catch(
				() => {},
			);
		}
	}, [isBudgetPage, loadBudgetConfig, page]);

	return (
		<main
			className={isCompactReportPage ? "space-y-3" : "space-y-5"}
			style={{ fontFamily: FINANCE_FONT_STACK }}
		>
			<MemoizedFinanceiroPageHeader
				budgetConfig={budgetConfig}
				budgetLoading={budgetLoading}
				budgetMonthMenuOpen={budgetMonthMenuOpen}
				budgetMonthSelectorYear={budgetMonthSelectorYear}
				budgetPeriodDisplayLabel={budgetPeriodDisplayLabel}
				budgetPeriodMode={budgetPeriodMode}
				budgetYearMenuOpen={budgetYearMenuOpen}
				budgetYearOptions={budgetYearOptions}
				data={data}
				hideHeaderControls={hideHeaderControls}
				isBudgetOperationalPage={isBudgetOperationalPage}
				isCompactReportPage={isCompactReportPage}
				load={load}
				loadBudgetConfig={loadBudgetConfig}
				loading={loading}
				meta={meta}
				onOpenDirectoratesConfig={openDirectoratesConfig}
				page={page}
				period={period}
				selectedBudgetReference={selectedBudgetReference}
				setBudgetDateModalOpen={setBudgetDateModalOpen}
				setBudgetMonthMenuOpen={setBudgetMonthMenuOpen}
				setBudgetMonthOverride={setBudgetMonthOverride}
				setBudgetPeriodMode={setBudgetPeriodMode}
				setBudgetYearMenuOpen={setBudgetYearMenuOpen}
				setExportModalOpen={setExportModalOpen}
				setPeriod={setPeriod}
			/>
			{message ? (
				<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}
			<MemoizedFinanceiroPageContent
				budgetConfig={budgetConfig}
				budgetDateRange={budgetDateRange}
				budgetLoading={budgetLoading}
				budgetPeriodMode={budgetPeriodMode}
				canManage={canManage}
				canManageEquipe={canManageEquipe}
				data={data}
				exportModalOpen={exportModalOpen}
				loading={loading}
				loadBudgetConfig={loadBudgetConfig}
				onOpenDirectoratesConfig={openDirectoratesConfig}
				page={page}
				period={period}
				selectedBudgetReference={selectedBudgetReference}
				setBudgetConfig={setBudgetConfig}
				setExportModalOpen={setExportModalOpen}
			/>
			{budgetDateModalOpen ? (
				<BudgetDateRangeModal
					value={budgetDateRange}
					onClose={() => setBudgetDateModalOpen(false)}
					onApply={(range) => {
						setBudgetDateRange(range);
						setBudgetPeriodMode("custom");
						setBudgetDateModalOpen(false);
					}}
				/>
			) : null}
			{directoratesConfigOpen ? (
				<BudgetDirectoratesQuickConfigModal
					canManage={canManage}
					config={budgetConfig || {}}
					onClose={closeDirectoratesConfig}
					onSave={saveDirectoratesConfig}
					saving={directoratesConfigSaving}
				/>
			) : null}
		</main>
	);
}
