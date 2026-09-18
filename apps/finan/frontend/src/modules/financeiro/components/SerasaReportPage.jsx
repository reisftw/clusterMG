// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): dominio Serasa extraido do arquivao. Codigo identico ao
// que estava la — so mudou de arquivo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
	CalendarClock,
	Download,
	Loader2,
	RefreshCw,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ModalShell from "../../../components/ModalShell";
import FinancialKpiCard from "./kpi/FinancialKpiCard";
import { ChartCard, EmptyState, barOptions } from "./shared/DashboardPrimitives";
import {
	buscarSerasaReportFinanceiro,
	limparSerasaReportFinanceiro,
	salvarSerasaReportFinanceiro,
	sincronizarPlanilhasFinanceiro,
} from "../services/financeiroService";
import { brl, integer } from "../utils/financeiroFormatters";
import {
	BudgetDateRangeModal,
	FeedbackModal,
	budgetMonthName,
	dateFromInput,
	formatUpdatedAt,
	getSempreLogoDataUrl,
	getVisibleError,
	sanitizeFileName,
} from "./shared/FinanceiroSharedHelpers";

const EMPTY_SERASA_LIST = [];

function formatSpreadsheetValue(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toLocaleDateString("pt-BR");
	}
	return value ?? "";
}

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

const SERASA_REPORT_OPTIONS = [
	{ id: "kpis", label: "Indicadores principais" },
	{ id: "monthly", label: "Evolução mensal Serasa" },
	{ id: "clients", label: "Evolução mensal Clientes Base" },
	{ id: "operations", label: "Concentração por operação" },
	{ id: "movements", label: "Movimentações do período" },
];

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


export default function SerasaReportPage({ canManage }) {
	const [report, setReport] = useState(null);
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState("");
	const [feedback, setFeedback] = useState(null);
	const [confirmClearOpen, setConfirmClearOpen] = useState(false);
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
			const XLSX = await import("xlsx");
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

	const handleClearSerasa = () => {
		if (!canManage) return;
		setConfirmClearOpen(true);
	};

	const confirmClearSerasa = async () => {
		setConfirmClearOpen(false);
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
						{/* UX_AUDIT.md, Fase 5 (paleta de botão primário): era
						bg-emerald-600 sólido, competindo com "Ler XLSX Serasa"
						(bg-blue-600) pela mesma hierarquia visual de CTA principal. */}
						<button
							type="button"
							onClick={handleForceSync}
							disabled={loading || Boolean(action)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
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
								<th scope="col" className="w-[110px] px-3 py-2">Data</th>
								<th scope="col" className="w-[130px] px-3 py-2">Tipo</th>
								<th scope="col" className="px-3 py-2">Descrição</th>
								<th scope="col" className="w-[180px] px-3 py-2">Operação</th>
								<th scope="col" className="w-[150px] px-3 py-2 text-right">Valor</th>
								<th scope="col" className="w-[150px] px-3 py-2">Classificação</th>
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

			<ConfirmDialog
				open={confirmClearOpen}
				tone="danger"
				title="Zerar dados importados do Serasa?"
				description="A configuração da origem/planilha é mantida — só os dados já importados são apagados."
				confirmLabel="Zerar dados Serasa"
				cancelLabel="Voltar"
				loading={action === "clear"}
				onConfirm={confirmClearSerasa}
				onCancel={() => setConfirmClearOpen(false)}
			/>
		</section>
	);
}

