// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): dominio Orcamento (Dashboard/Centros de Custo/Aprovacoes/
// DRE/Dados/Configuracoes — tudo que ainda roteava atraves de
// BudgetOperationalPage e CostCentersConfigSection) extraido do
// arquivao. Codigo identico ao que estava la — so mudou de arquivo.
// Continua reaproveitando os mesmos componentes de view ja extraidos
// (BudgetDashboardView, BudgetCostCentersView, BudgetDreView,
// BudgetApprovalsView) e as secoes de configuracao ja modulares
// (CompaniesBranchesConfigSection etc.) — so a "cola" entre eles
// morava no arquivao.
import {
	lazy,
	useEffect,
	useMemo,
	useState,
} from "react";
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
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ModalShell from "../../../components/ModalShell";
import { ROUTES } from "../financeiroRoutes";
import CostCenterMovementsTab from "./budget/costcenter/CostCenterMovementsTab";
import CostCenterRegistrationTab from "./budget/costcenter/CostCenterRegistrationTab";
import { getBudgetDashboardDetailRenderer } from "./budget/details";
import FinancialKpiCard from "./kpi/FinancialKpiCard";
import { ChartCard, EmptyState, FinancePanel, PanelActionButton } from "./shared/DashboardPrimitives";
import { barOptions } from "./shared/chartOptions";
import { useBudgetConfig } from "../hooks/useBudgetConfig";
import { useBudgetOperationalActions } from "../hooks/useBudgetOperationalActions";
import { useCostCenterForm } from "../hooks/useCostCenterForm";
import {
	buildBudgetOperationalKpis,
	buildCostCenterTopCards,
	buildDirectorateRows,
	buildOperationalCenterGroups,
	findBudgetParetoRows,
	getBudgetInsights as getBudgetInsightsFromStatement,
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
import { brl, decimal, integer } from "../utils/financeiroFormatters";
import {
	budgetEntityId,
	budgetMonthName,
	buildBudgetPeriod,
	findDirectorateByName,
	formatUpdatedAt,
	getSempreLogoDataUrl,
	getVisibleError,
	normalizeDirectorates,
	normalizeImportHeader,
	sanitizeFileName,
} from "./shared/FinanceiroSharedHelpers";
import { BudgetDateRangeModal, FeedbackModal } from "./shared/FinanceiroSharedModals";

const BudgetApprovalsView = lazy(() => import("./budget/BudgetApprovalsView"));
const BudgetCostCentersView = lazy(() => import("./budget/BudgetCostCentersView"));
const BudgetDashboardView = lazy(() => import("./budget/BudgetDashboardView"));
const BudgetDreView = lazy(() => import("./budget/BudgetDreView"));
const CompaniesBranchesConfigSection = lazy(() =>
	import("./budget/config/CompaniesBranchesConfigSection"),
);
const CostCentersTreeConfigSection = lazy(() =>
	import("./budget/config/CostCentersTreeConfigSection"),
);
const FinancialAccountsConfigSection = lazy(() =>
	import("./budget/config/FinancialAccountsConfigSection"),
);
const FinancialAccountCategoriesModal = lazy(() =>
	import("./budget/config/FinancialAccountsConfigSection").then((module) => ({
		default: module.FinancialAccountCategoriesModal,
	})),
);
const BudgetMatrixConfigSection = lazy(() =>
	import("./budget/config/BudgetMatrixConfigSection"),
);
const BudgetParametersSection = lazy(() =>
	import("./budget/config/BudgetParametersSection"),
);
const PartnersConfigSection = lazy(() =>
	import("./budget/config/PartnersConfigSection"),
);

const BUDGET_OPERATIONAL_PAGE_VIEWS = {
	orcamentoAprovacoes: BudgetApprovalsView,
	orcamentoCentrosCusto: BudgetCostCentersView,
	orcamentoDre: BudgetDreView,
};

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
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-50"
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
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
									className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
						<th scope="col" className="w-[280px] px-4 py-3">Fornecedor</th>
						<th scope="col" className="w-[150px] px-4 py-3 text-right">Valor acumulado</th>
						<th scope="col" className="w-[120px] px-4 py-3 text-right">Participação</th>
						<th scope="col" className="w-[320px] px-4 py-3">Centros de custo</th>
						<th scope="col" className="w-[310px] px-4 py-3">Contas financeiras</th>
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
						<th scope="col" className="w-[260px] px-4 py-3">Fornecedor</th>
						<th scope="col" className="w-[260px] px-4 py-3">Conta financeira</th>
						<th scope="col" className="w-[220px] px-4 py-3">Centro de custo</th>
						<th scope="col" className="w-[220px] px-4 py-3">Matriz / filial</th>
						<th scope="col" className="w-[120px] px-4 py-3">Referência</th>
						<th scope="col" className="w-[120px] px-4 py-3 text-right">Valor</th>
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

const BUDGET_COMPANY_GROUP_OPTIONS = [
	{ id: "Sempre", codigo: "Sempre", nome: "Sempre" },
	{ id: "On", codigo: "On", nome: "On" },
	{ id: "Onnet", codigo: "Onnet", nome: "Onnet" },
];

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
							<th scope="col" className="px-3 py-2">Centro</th>
							<th scope="col" className="px-3 py-2">Status</th>
							<th scope="col" className="px-3 py-2 text-right">Orçado</th>
							<th scope="col" className="px-3 py-2 text-right">Realiz.</th>
							<th scope="col" className="px-3 py-2 text-right">Comp.</th>
							<th scope="col" className="px-3 py-2 text-right">Forecast</th>
							<th scope="col" className="px-3 py-2 text-right">Run Rate</th>
							<th scope="col" className="px-3 py-2 text-right">Desvio</th>
							<th scope="col" className="px-3 py-2">6 meses</th>
							<th scope="col" className="px-3 py-2 text-right">Ações</th>
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

export function BudgetOperationalPage({
	page,
	config,
	loading,
	canManage,
	onConfigUpdated,
	onOpenDirectoratesConfig,
	selectedPeriod,
}) {
	const [selectedCompanyId, setSelectedCompanyId] = useState("");
	const effectiveSelectedPeriod = useMemo(
		() => ({
			...selectedPeriod,
			companyId: ["orcamentoDashboard", "orcamentoCentrosCusto"].includes(page)
				? selectedCompanyId
				: "",
		}),
		[page, selectedCompanyId, selectedPeriod],
	);
	const insights = useMemo(
		() => getBudgetInsightsFromStatement(config, effectiveSelectedPeriod),
		[config, effectiveSelectedPeriod],
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
		centerDeleteConfirm,
		cancelRemoveOperationalCenter,
		confirmRemoveOperationalCenter,
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
		selectedPeriod: effectiveSelectedPeriod,
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
	const companyOptions = BUDGET_COMPANY_GROUP_OPTIONS;

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
				companyOptions={companyOptions}
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
				centerDeleteConfirm={centerDeleteConfirm}
				cancelRemoveOperationalCenter={cancelRemoveOperationalCenter}
				confirmRemoveOperationalCenter={confirmRemoveOperationalCenter}
				resendApprovalAdjustment={resendApprovalAdjustment}
				responsibleOnly={responsibleOnly}
				rowByCenterId={rowByCenterId}
				safeCenterPage={safeCenterPage}
				saving={saving}
				selectedPeriod={effectiveSelectedPeriod}
				selectedCompanyId={selectedCompanyId}
				setSelectedCompanyId={setSelectedCompanyId}
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
			companyOptions={companyOptions}
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
			onCompanyChange={setSelectedCompanyId}
			onOpenDirectoratesConfig={onOpenDirectoratesConfig}
			onShowDashboardDetail={setDashboardDetail}
			pareto={pareto}
			renderDashboardDetail={renderDashboardDetail}
			selectedCompanyId={selectedCompanyId}
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

function MoneyInput({ id, value, disabled, onChange }) {
	return (
		<div className="mt-2 flex overflow-hidden rounded-xl border border-emerald-200 bg-white ring-0 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-100">
			<span className="flex min-h-11 items-center bg-emerald-50 px-3 text-sm font-black text-emerald-800">
				R$
			</span>
			<input
				id={id}
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
									<th scope="col" className="px-4 py-3">Centro</th>
									<th scope="col" className="px-4 py-3">Tipo</th>
									<th scope="col" className="px-4 py-3">Responsável</th>
									<th scope="col" className="px-4 py-3 text-right">Mensal</th>
									<th scope="col" className="px-4 py-3 text-right">Realizado</th>
									<th scope="col" className="px-4 py-3 text-right">Uso</th>
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
										<th scope="col" className="px-4 py-3">Data</th>
										<th scope="col" className="px-4 py-3">Fornecedor</th>
										<th scope="col" className="px-4 py-3">Centro</th>
										<th scope="col" className="px-4 py-3">Conta analítica</th>
										<th scope="col" className="px-4 py-3">Matriz / Filial</th>
										<th scope="col" className="px-4 py-3 text-right">Valor</th>
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
										<th scope="col" className="px-4 py-3">Data</th>
										<th scope="col" className="px-4 py-3">Centro de custo</th>
										<th scope="col" className="px-4 py-3">Conta</th>
										<th scope="col" className="px-4 py-3">Matriz / Filial</th>
										<th scope="col" className="px-4 py-3">Documento</th>
										<th scope="col" className="px-4 py-3 text-right">Valor</th>
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

export function OrcamentoConfiguracoesPage({
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
