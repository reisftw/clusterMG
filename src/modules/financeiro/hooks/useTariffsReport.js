import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
	buscarTarifasReportFinanceiro,
	limparTarifasReportFinanceiro,
	salvarTarifasReportFinanceiro,
} from "../services/financeiroService";
import { integer } from "../utils/financeiroFormatters";
import {
	buildTariffsInsights,
	formatTariffsPeriodLabel,
} from "../utils/tariffsViewModels";

const DEFAULT_TARIFFS_REFERENCE = {
	referenceYear: 2026,
	referenceMonth: 8,
};

function buildTariffsSheetsFromWorkbook(workbook) {
	return workbook.SheetNames.map((sheetName) => ({
		sheetName,
		rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			raw: false,
			defval: "",
		}),
	}));
}

export function useTariffsReport({
	canManage,
	getVisibleError,
} = {}) {
	const [report, setReport] = useState(null);
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState("");
	const [feedback, setFeedback] = useState(null);
	const [reportModalOpen, setReportModalOpen] = useState(false);
	const [monthMenuOpen, setMonthMenuOpen] = useState(false);
	const [yearMenuOpen, setYearMenuOpen] = useState(false);
	const [dateModalOpen, setDateModalOpen] = useState(false);
	const [periodMode, setPeriodMode] = useState("year");
	const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });
	const [selectedReference, setSelectedReference] = useState(
		DEFAULT_TARIFFS_REFERENCE,
	);

	const resolveVisibleError = useCallback(
		(error, fallback) =>
			typeof getVisibleError === "function"
				? getVisibleError(error, fallback)
				: { message: error?.message || fallback },
		[getVisibleError],
	);

	const loadTariffs = useCallback(async () => {
		setLoading(true);
		try {
			const response = await buscarTarifasReportFinanceiro();
			setReport(response.data || {});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao carregar Tarifas",
				...resolveVisibleError(
					error,
					"Não foi possível carregar o report Tarifas.",
				),
			});
		} finally {
			setLoading(false);
		}
	}, [resolveVisibleError]);

	useEffect(() => {
		loadTariffs();
	}, [loadTariffs]);

	const handleUpload = useCallback(
		async (event) => {
			const file = event.target.files?.[0];
			if (!file) return;
			setAction("upload");
			try {
				const buffer = await file.arrayBuffer();
				const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
				const sheets = buildTariffsSheetsFromWorkbook(workbook);
				const response = await salvarTarifasReportFinanceiro({
					fileName: file.name,
					sheets,
				});
				setReport(response.data || {});
				const summary = response.data?.summary || {};
				setFeedback({
					type: "success",
					title: "Leitura de Tarifas concluída",
					message: `${integer.format(summary.blocosDetectados || 0)} bloco(s) detectado(s) em ${integer.format(sheets.length)} aba(s).`,
					details: `Receitas diárias: ${integer.format(response.data?.receitasDiarias?.length || 0)}\nTarifas mensais: ${integer.format(response.data?.tarifasMensais?.length || 0)}\nFormas de pagamento: ${integer.format(response.data?.formasPagamentoValor?.length || 0)}\nReceita por cliente: ${integer.format(response.data?.receitaPorCliente?.length || 0)}\nBlocos não mapeados: ${integer.format(summary.blocosNaoMapeados || 0)}`,
				});
			} catch (error) {
				setFeedback({
					type: "error",
					title: "Erro na leitura de Tarifas",
					...resolveVisibleError(
						error,
						"Não foi possível ler/importar a planilha de Tarifas.",
					),
				});
			} finally {
				setAction("");
				event.target.value = "";
			}
		},
		[resolveVisibleError],
	);

	const handleClear = useCallback(async () => {
		if (
			!canManage ||
			!window.confirm("Zerar somente os dados importados de Tarifas?")
		) {
			return;
		}
		setAction("clear");
		try {
			const response = await limparTarifasReportFinanceiro();
			setReport(response.data || {});
			setFeedback({
				type: "success",
				title: "Dados de Tarifas zerados",
				message: "Os dados importados de Tarifas foram limpos.",
			});
		} catch (error) {
			setFeedback({
				type: "error",
				title: "Erro ao zerar Tarifas",
				...resolveVisibleError(
					error,
					"Não foi possível zerar os dados de Tarifas.",
				),
			});
		} finally {
			setAction("");
		}
	}, [canManage, resolveVisibleError]);

	const selectedPeriod = useMemo(
		() => ({
			mode: periodMode,
			...dateRange,
			...selectedReference,
		}),
		[dateRange, periodMode, selectedReference],
	);
	const periodLabel = useMemo(
		() => formatTariffsPeriodLabel(selectedPeriod),
		[selectedPeriod],
	);
	const insights = useMemo(
		() => buildTariffsInsights(report || {}, selectedPeriod),
		[report, selectedPeriod],
	);
	const monthlyTariffsChart = useMemo(
		() => ({
			labels: insights.tarifasPorMes.map((item) => item.label),
			datasets: [
				{
					label: "Tarifas",
					data: insights.tarifasPorMes.map((item) => item.value),
					borderColor: "#f97316",
					backgroundColor: "rgba(249,115,22,0.14)",
					fill: true,
					tension: 0.35,
					pointRadius: 3,
				},
			],
		}),
		[insights.tarifasPorMes],
	);
	const paymentChart = useMemo(
		() => ({
			labels: insights.pagamentoValor.slice(0, 6).map((item) => item.label),
			datasets: [
				{
					data: insights.pagamentoValor.slice(0, 6).map((item) => item.value),
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
		[insights.pagamentoValor],
	);

	const applyDateRange = useCallback((range) => {
		setDateRange(range);
		setPeriodMode("custom");
		setDateModalOpen(false);
	}, []);
	const openDateRangeModal = useCallback(() => {
		setMonthMenuOpen(false);
		setYearMenuOpen(false);
		setDateModalOpen(true);
	}, []);
	const closeDateRangeModal = useCallback(() => {
		setDateModalOpen(false);
	}, []);
	const openReportModal = useCallback(() => {
		setReportModalOpen(true);
	}, []);
	const closeReportModal = useCallback(() => {
		setReportModalOpen(false);
	}, []);
	const closeFeedback = useCallback(() => {
		setFeedback(null);
	}, []);
	const selectMonth = useCallback((month) => {
		setSelectedReference((current) => ({
			...current,
			referenceMonth: month,
		}));
		setPeriodMode("month");
		setMonthMenuOpen(false);
	}, []);
	const selectYear = useCallback((year) => {
		setSelectedReference((current) => ({
			...current,
			referenceYear: year,
		}));
		setPeriodMode("year");
		setYearMenuOpen(false);
	}, []);
	const toggleMonthMenu = useCallback(() => {
		setPeriodMode("month");
		setYearMenuOpen(false);
		setMonthMenuOpen((current) => !current);
	}, []);
	const toggleYearMenu = useCallback(() => {
		setPeriodMode("year");
		setMonthMenuOpen(false);
		setYearMenuOpen((current) => !current);
	}, []);

	return {
		action,
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
		selectedReference,
		yearMenuOpen,
		applyDateRange,
		closeFeedback,
		closeDateRangeModal,
		closeReportModal,
		selectMonth,
		selectYear,
		setDateModalOpen,
		setFeedback,
		setMonthMenuOpen,
		setPeriodMode,
		setReportModalOpen,
		setSelectedReference,
		setYearMenuOpen,
		toggleMonthMenu,
		toggleYearMenu,
	};
}
