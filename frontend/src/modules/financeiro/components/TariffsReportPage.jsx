// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): dominio Tarifas extraido do arquivao. Os subcomponentes
// visuais (TariffsDetailLayout, TariffsPeriodSelector etc.) ja viviam em
// ./tariffs/**, so a "cola" (paginas + modal de export + PDF) ainda
// estava no arquivao. Codigo identico ao que estava la — so mudou de
// arquivo.
import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ModalShell from "../../../components/ModalShell";
import { useTariffsReport } from "../hooks/useTariffsReport";
import {
	getTariffsAvailableYears as getTariffsDetailAvailableYears,
	TARIFFS_DETAIL_BUILDERS,
} from "../domain/financialStatement";
import { buscarTarifasReportFinanceiro } from "../services/financeiroService";
import { splitPdfTextToTwoLines } from "../utils/financeiroPdfText";
import { brl, formatTariffFee, integer } from "../utils/financeiroFormatters";
import {
	BudgetDateRangeModal,
	FeedbackModal,
	formatUpdatedAt,
	getSempreLogoDataUrl,
	getVisibleError,
	sanitizeFileName,
} from "./shared/FinanceiroSharedHelpers";

const TariffsDetailLayout = lazy(() => import("./tariffs/TariffsDetailLayout"));
const TariffsDetectedBlocks = lazy(() => import("./tariffs/TariffsDetectedBlocks"));
const TariffsOverviewCharts = lazy(() => import("./tariffs/TariffsOverviewCharts"));
const TariffsOverviewKpis = lazy(() => import("./tariffs/TariffsOverviewKpis"));
const TariffsPeriodSelector = lazy(() => import("./tariffs/TariffsPeriodSelector"));
const TariffsUploadActions = lazy(() => import("./tariffs/TariffsUploadActions"));

const TARIFFS_REPORT_OPTIONS = [
	{ id: "kpis", label: "Indicadores principais" },
	{ id: "boletoTariffs", label: "Tarifas de boletos por banco/forma de cobrança" },
	{ id: "monthlyTariffs", label: "Tarifas mensais por banco" },
	{ id: "paymentMix", label: "Formas de pagamento" },
	{ id: "billingMethods", label: "Clientes por forma de cobrança" },
	{ id: "topClients", label: "Receita por cliente" },
	{ id: "invoices", label: "Faturas por mês" },
];

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

export function TariffsDetailPage({ type = "faturas" }) {
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

export function TariffsReportPage({ canManage }) {
	const {
		action,
		applyDateRange,
		dateModalOpen,
		dateRange,
		feedback,
		handleClear,
		confirmClearOpen,
		confirmClear,
		cancelClear,
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

			<ConfirmDialog
				open={confirmClearOpen}
				tone="danger"
				title="Zerar dados importados de Tarifas?"
				description="Só os dados já importados são apagados — a configuração da planilha é mantida."
				confirmLabel="Zerar dados de Tarifas"
				cancelLabel="Voltar"
				loading={action === "clear"}
				onConfirm={confirmClear}
				onCancel={cancelClear}
			/>
		</section>
	);
}
