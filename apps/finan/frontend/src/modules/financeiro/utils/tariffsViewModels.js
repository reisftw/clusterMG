import { brl, integer } from "./financeiroFormatters";

const TARIFF_CHART_COLORS = [
	"#2563eb",
	"#10b981",
	"#f97316",
	"#8b5cf6",
	"#ef4444",
	"#06b6d4",
	"#84cc16",
	"#64748b",
];

export function tariffBudgetMonthName(month) {
	const date = new Date(2026, Number(month || 1) - 1, 1);
	return date.toLocaleDateString("pt-BR", { month: "long" });
}

export function getTariffsAvailableYears(report = {}) {
	const arrays = [
		report.receitasDiarias,
		report.tarifasMensais,
		report.formasPagamentoQuantidade,
		report.formasPagamentoValor,
		report.formasCobrancaValor,
		report.faturas,
		report.receitaPorCliente,
	];
	const years = arrays
		.flatMap((items) => items || [])
		.map((item) => Number(item.year || 0))
		.filter(Boolean);
	const unique = [...new Set(years)].sort((a, b) => b - a);
	return unique.length ? unique : [new Date().getFullYear()];
}

export function filterTariffsByYear(items = [], year) {
	return (items || []).filter((item) => Number(item.year || 0) === Number(year));
}

export function filterTariffsByYearMonth(items = [], year, month = 0) {
	return filterTariffsByYear(items, year).filter(
		(item) => !month || Number(item.month || 0) === Number(month),
	);
}

export function aggregateTariffsByMonth(items = [], valueField = "value") {
	const map = new Map();
	items.forEach((item) => {
		const year = Number(item.year || 0);
		const month = Number(item.month || 0);
		if (!year || !month) return;
		const key = `${year}-${String(month).padStart(2, "0")}`;
		const current = map.get(key) || {
			key,
			year,
			month,
			label: `${year} - ${tariffBudgetMonthName(month)}`,
			value: 0,
			count: 0,
		};
		current.value += Number(item[valueField] || 0);
		current.count += 1;
		map.set(key, current);
	});
	return [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export function aggregateTariffsByLabel(items = [], labelField, valueField = "value") {
	const map = new Map();
	items.forEach((item) => {
		const label = String(item[labelField] || "Sem identificação").trim();
		const current = map.get(label) || {
			label,
			value: 0,
			count: 0,
			bankColor: item.bankColor,
			bankInitials: item.bankInitials,
		};
		current.value += Number(item[valueField] || 0);
		current.count += 1;
		map.set(label, current);
	});
	return [...map.values()].sort((a, b) => b.value - a.value);
}

export function aggregateTariffsMonthlySeries(items = [], labelField, valueField = "value") {
	const labels = Array.from({ length: 12 }, (_, index) => ({
		month: index + 1,
		label: tariffBudgetMonthName(index + 1),
	}));
	const grouped = new Map();
	(items || []).forEach((item) => {
		const label = String(item[labelField] || "Sem identificação").trim();
		const month = Number(item.month || 0);
		if (!month) return;
		const current = grouped.get(label) || Array(12).fill(0);
		current[month - 1] += Number(item[valueField] || 0);
		grouped.set(label, current);
	});
	const datasets = [...grouped.entries()].slice(0, 8).map(([label, data], index) => ({
		label,
		data,
		borderColor: TARIFF_CHART_COLORS[index % TARIFF_CHART_COLORS.length],
		backgroundColor: TARIFF_CHART_COLORS[index % TARIFF_CHART_COLORS.length],
		fill: false,
		tension: 0.35,
		pointRadius: 3,
	}));
	return { labels: labels.map((item) => item.label), datasets };
}

export function addTariffsPercentOfTotal(items = [], valueField = "value") {
	const total = (items || []).reduce(
		(sum, item) => sum + Number(item[valueField] || 0),
		0,
	);
	return (items || []).map((item) => ({
		...item,
		percentOfTotal: total ? (Number(item[valueField] || 0) / total) * 100 : 0,
	}));
}

function dateFromTariffInput(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function tariffItemMatchesPeriod(item = {}, selectedPeriod = {}) {
	const year = Number(item.year || 0);
	const month = Number(item.month || 0);
	if (!year || !month) return true;
	if (selectedPeriod.mode === "year") return year === Number(selectedPeriod.referenceYear);
	if (selectedPeriod.mode === "custom") {
		const date = dateFromTariffInput(`${year}-${String(month).padStart(2, "0")}-01`);
		const start = dateFromTariffInput(selectedPeriod.startDate);
		const end = dateFromTariffInput(selectedPeriod.endDate);
		if (!date || !start || !end) return true;
		return date >= start && date <= end;
	}
	return (
		year === Number(selectedPeriod.referenceYear) &&
		month === Number(selectedPeriod.referenceMonth)
	);
}

export function formatTariffsPeriodLabel(selectedPeriod = {}) {
	if (selectedPeriod.mode === "year") return `Ano ${selectedPeriod.referenceYear}`;
	if (selectedPeriod.mode === "custom") return "Datas selecionadas";
	return `Mês ${tariffBudgetMonthName(selectedPeriod.referenceMonth)}`;
}

export function invoiceMetricType(metric) {
	const text = String(metric || "");
	if (/cancelad|outros lan/i.test(text)) return "Canceladas";
	if (/ativa|faturamento/i.test(text)) return "Ativas";
	return "";
}

export function isRelevantTariffInvoiceRecord(item = {}) {
	const type = invoiceMetricType(item.metric);
	if (!type) return false;
	const year = Number(item.year || 0);
	const month = Number(item.month || 0);
	if (!year || !month) return false;
	const now = new Date();
	return !(year === now.getFullYear() && month > now.getMonth() + 1);
}

export function aggregateInvoiceNetByMonth(items = []) {
	const map = new Map();
	items.forEach((item) => {
		const year = Number(item.year || 0);
		const month = Number(item.month || 0);
		if (!year || !month) return;
		const type = invoiceMetricType(item.metric);
		if (!type) return;
		const key = `${year}-${String(month).padStart(2, "0")}`;
		const current = map.get(key) || {
			key,
			year,
			month,
			label: `${year} - ${tariffBudgetMonthName(month)}`,
			value: 0,
			active: 0,
			canceled: 0,
			count: 0,
		};
		const value = Number(item.value || 0);
		if (type === "Ativas") {
			current.active += value;
			current.value += value;
		}
		if (type === "Canceladas") {
			current.canceled += value;
			current.value -= value;
		}
		current.count += 1;
		map.set(key, current);
	});
	return [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export function aggregateBillingClients(items = []) {
	const map = new Map();
	items.forEach((item) => {
		const label = String(item.method || "Sem identificação").trim();
		const current = map.get(label) || {
			label,
			method: label,
			value: 0,
			customers: 0,
			estimatedValue: 0,
			count: 0,
			bankColor: item.bankColor,
			bankInitials: item.bankInitials,
		};
		current.value += Number(item.customers || 0);
		current.customers += Number(item.customers || 0);
		current.estimatedValue += Number(item.estimatedValue || 0);
		current.count += 1;
		map.set(label, current);
	});
	return [...map.values()].sort((a, b) => b.customers - a.customers);
}

export function buildTariffsInsights(report = {}, selectedPeriod = {}) {
	const filter = (items = []) =>
		(items || []).filter((item) => tariffItemMatchesPeriod(item, selectedPeriod));
	const receitasDiarias = filter(report.receitasDiarias);
	const tarifasMensais = filter(report.tarifasMensais);
	const formasPagamentoQuantidade = filter(report.formasPagamentoQuantidade);
	const formasPagamentoValor = filter(report.formasPagamentoValor);
	const formasCobrancaValor = filter(report.formasCobrancaValor);
	const faturas = filter(report.faturas).filter(isRelevantTariffInvoiceRecord);
	const receitaPorCliente = filter(report.receitaPorCliente);
	const formasCobrancaClientes = report.formasCobrancaClientes || [];
	const tarifasBoletos = report.tarifasBoletos || [];
	const receitaMensal = aggregateTariffsByMonth(receitasDiarias);
	const tarifasPorMes = aggregateTariffsByMonth(tarifasMensais);
	const bancos = aggregateTariffsByLabel(tarifasMensais, "bank");
	const pagamentoValor = aggregateTariffsByLabel(formasPagamentoValor, "method");
	const pagamentoQuantidade = aggregateTariffsByLabel(
		formasPagamentoQuantidade,
		"method",
		"quantity",
	);
	const cobrancaClientes = aggregateBillingClients(formasCobrancaClientes);
	const topClientes = aggregateTariffsByLabel(receitaPorCliente, "clientName").slice(0, 10);
	const faturasMensais = aggregateInvoiceNetByMonth(faturas);
	const receitaTotal = receitaMensal.reduce((sum, item) => sum + item.value, 0);
	const tarifasTotal = tarifasMensais.reduce((sum, item) => sum + Number(item.value || 0), 0);
	const receitaClienteTotal = receitaPorCliente.reduce((sum, item) => sum + Number(item.value || 0), 0);
	const totalClientesCobranca = formasCobrancaClientes.reduce((sum, item) => sum + Number(item.customers || 0), 0);
	const totalPagamentos = formasPagamentoQuantidade.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
	const custoMedioCobranca = totalClientesCobranca ? tarifasTotal / totalClientesCobranca : 0;
	return {
		receitasDiarias,
		tarifasMensais,
		formasPagamentoQuantidade,
		formasPagamentoValor,
		formasCobrancaValor,
		formasCobrancaClientes,
		tarifasBoletos,
		faturas,
		receitaPorCliente,
		receitaMensal,
		tarifasPorMes,
		bancos,
		pagamentoValor,
		pagamentoQuantidade,
		cobrancaClientes,
		topClientes,
		faturasMensais,
		kpis: {
			receitaTotal,
			tarifasTotal,
			custoMedioCobranca,
			totalClientesCobranca,
			totalPagamentos,
			receitaClienteTotal,
		},
	};
}

export function formatTariffFee(item = {}) {
	const label = String(item.valueLabel || "").trim();
	if (label && /%/.test(label)) return label;
	const numericLabel = Number(label.replace(",", "."));
	if (label && Number.isNaN(numericLabel)) return label;
	return brl.format(Number(item.value || numericLabel || 0));
}

export function aggregateInvoiceMetrics(rows = []) {
	const metrics = [
		{ label: "Ativas", value: 0 },
		{ label: "Canceladas", value: 0 },
	];
	rows.forEach((item) => {
		const type = invoiceMetricType(item.metric);
		if (!type) return;
		const target = metrics.find((metric) => metric.label === type);
		if (target) target.value += Number(item.value || 0);
	});
	return metrics.filter((item) => item.value > 0);
}

export function buildInvoiceMonthlySeries(rows = []) {
	const monthly = new Map();
	rows.forEach((item) => {
		const month = Number(item.month || 0);
		if (month < 1 || month > 12) return;
		const type = invoiceMetricType(item.metric);
		if (!type) return;
		const key = String(month).padStart(2, "0");
		const current = monthly.get(key) || {
			month,
			label: tariffBudgetMonthName(month),
			active: 0,
			canceled: 0,
		};
		const value = Number(item.value || 0);
		if (type === "Ativas") current.active += value;
		if (type === "Canceladas") current.canceled += value;
		monthly.set(key, current);
	});
	const values = [...monthly.values()]
		.filter((item) => item.active > 0 || item.canceled > 0)
		.sort((a, b) => a.month - b.month);
	return {
		labels: values.map((item) => item.label),
		datasets: [
			{
				label: "Ativas",
				data: values.map((item) => item.active),
				backgroundColor: "#10b981",
				borderRadius: 8,
			},
			{
				label: "Canceladas",
				data: values.map((item) => item.canceled),
				backgroundColor: "#ef4444",
				borderRadius: 8,
			},
		],
	};
}

export function chartHasValues(chart = {}) {
	return (chart.datasets || []).some((dataset) =>
		(dataset.data || []).some((value) => Number(value || 0) > 0),
	);
}

function buildDoughnutChart(rows = []) {
	return {
		labels: rows.slice(0, 8).map((item) => item.label),
		datasets: [
			{
				data: rows.slice(0, 8).map((item) => item.value),
				backgroundColor: TARIFF_CHART_COLORS,
				borderWidth: 0,
			},
		],
	};
}

function buildLineMonthlyChart(monthly = [], title = "") {
	return {
		labels: monthly.map((item) => item.label),
		datasets: [
			{
				label: title,
				data: monthly.map((item) => item.value),
				backgroundColor: "#10b981",
				borderColor: "#10b981",
				borderRadius: 8,
				fill: false,
				tension: 0.35,
			},
		],
	};
}

function filterRowsBySearch(rows = [], searchTerm = "") {
	const normalizedSearch = searchTerm.trim().toLowerCase();
	if (!normalizedSearch) return rows;
	return rows.filter((item) => {
		const text = [
			item.clientCode,
			item.clientName,
			item.method,
			item.metric,
			item.monthName,
			item.value,
			item.quantity,
		]
			.join(" ")
			.toLowerCase();
		return text.includes(normalizedSearch);
	});
}

function paginateRows(rows = [], pageIndex = 1, pageSize = 50) {
	const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
	const safePageIndex = Math.min(pageIndex, totalPages);
	return {
		totalPages,
		safePageIndex,
		pagedRows: rows.slice((safePageIndex - 1) * pageSize, safePageIndex * pageSize),
	};
}

function buildBaseViewModel({
	type,
	title,
	subtitle,
	year,
	month,
	rows,
	kpis,
	rankingTitle,
	doughnutRows,
	doughnutTotal,
	monthlyChart,
	monthlyChartType = "line",
	monthlyEmpty,
	tableMode,
	searchTerm = "",
	pageIndex = 1,
	pageSize = 50,
	selectedInvoiceMetricIndex = null,
}) {
	const searchedRows = filterRowsBySearch(rows, searchTerm);
	const pagination = paginateRows(searchedRows, pageIndex, pageSize);
	const selectedInvoiceMetric =
		type === "faturas" && Number.isInteger(selectedInvoiceMetricIndex)
			? doughnutRows[selectedInvoiceMetricIndex]
			: null;
	const resolvedDoughnutTotal =
		doughnutTotal ??
		doughnutRows
					.slice(0, 8)
					.reduce((sum, item) => sum + Number(item.value || 0), 0);
	return {
		type,
		title,
		subtitle,
		year,
		month,
		kpis,
		rankingTitle,
		doughnutRows,
		doughnutChart: buildDoughnutChart(doughnutRows),
		centerText: {
			title:
				type === "faturas"
					? selectedInvoiceMetric?.label || "Líquido"
					: "Total",
			value:
				type === "faturas"
					? integer.format(Number(selectedInvoiceMetric?.value ?? resolvedDoughnutTotal))
					: brl.format(resolvedDoughnutTotal),
		},
		monthlyChart,
		monthlyChartType,
		monthlyEmpty,
		searchPlaceholder:
			tableMode === "clients" ? "Buscar cliente ou código" : "Buscar forma, cobrança ou mês",
		searchedRows,
		tableRows: pagination.pagedRows,
		totalPages: pagination.totalPages,
		safePageIndex: pagination.safePageIndex,
		tableMode,
		showTable: tableMode !== "none",
	};
}

export function buildInvoicesDetailViewModel({
	report = {},
	year,
	month = 0,
	searchTerm = "",
	pageIndex = 1,
	pageSize = 50,
	selectedInvoiceMetricIndex = null,
} = {}) {
	const invoiceRows = (report.faturas || []).filter(isRelevantTariffInvoiceRecord);
	const rows = filterTariffsByYearMonth(invoiceRows, year, month);
	const yearRows = filterTariffsByYear(invoiceRows, year);
	const ativas = rows.filter((item) => invoiceMetricType(item.metric) === "Ativas");
	const canceladas = rows.filter((item) => invoiceMetricType(item.metric) === "Canceladas");
	const activeTotal = ativas.reduce((sum, item) => sum + Number(item.value || 0), 0);
	const canceledTotal = canceladas.reduce((sum, item) => sum + Number(item.value || 0), 0);
	const metrics = aggregateInvoiceMetrics(rows);
	const monthlyChart = buildInvoiceMonthlySeries(yearRows);
	return buildBaseViewModel({
		type: "faturas",
		title: "Faturas",
		subtitle: "Faturas ativas e canceladas por ano e mês.",
		year,
		month,
		rows,
		kpis: [
			{ title: "Ativas", value: activeTotal, type: "number", icon: "FileText", color: "emerald" },
			{ title: "Canceladas", value: canceledTotal, type: "number", icon: "AlertTriangle", color: "rose" },
			{ title: "Meses lidos", value: new Set(rows.map((item) => item.month).filter(Boolean)).size, type: "number", icon: "CalendarClock", color: "violet" },
		],
		rankingTitle: "Indicadores de faturas",
		doughnutRows: metrics,
		doughnutTotal: activeTotal - canceledTotal,
		monthlyChart,
		monthlyChartType: "bar",
		monthlyEmpty: !chartHasValues(monthlyChart),
		tableMode: "none",
		searchTerm,
		pageIndex,
		pageSize,
		selectedInvoiceMetricIndex,
	});
}

export function buildClientRevenueDetailViewModel({
	report = {},
	year,
	month = 0,
	searchTerm = "",
	pageIndex = 1,
	pageSize = 50,
} = {}) {
	const rows = filterTariffsByYearMonth(report.receitaPorCliente, year, month);
	const monthly = aggregateTariffsByMonth(filterTariffsByYear(report.receitaPorCliente, year));
	const clients = aggregateTariffsByLabel(rows, "clientName");
	return buildBaseViewModel({
		type: "recCliente",
		title: "Receita Cliente",
		subtitle: "Receita por cliente com ranking anual e evolução mensal.",
		year,
		month,
		rows,
		kpis: [
			{ title: "Receita anual", value: rows.reduce((sum, item) => sum + Number(item.value || 0), 0), type: "currency", icon: "CircleDollarSign", color: "emerald" },
			{ title: "Clientes", value: new Set(rows.map((item) => item.clientCode || item.clientName)).size, type: "number", icon: "Users", color: "blue" },
			{ title: "Média por cliente", value: clients.length ? clients.reduce((sum, item) => sum + Number(item.value || 0), 0) / clients.length : 0, type: "currency", icon: "BadgeDollarSign", color: "amber" },
			{ title: "Maior cliente", value: clients[0]?.label || "-", type: "text", icon: "Landmark", color: "violet" },
		],
		rankingTitle: "Ranking de clientes",
		doughnutRows: clients,
		monthlyChart: buildLineMonthlyChart(monthly, "Receita Cliente"),
		monthlyEmpty: !monthly.length,
		tableMode: "clients",
		searchTerm,
		pageIndex,
		pageSize,
	});
}

export function buildPaymentMethodsDetailViewModel({
	report = {},
	year,
	month = 0,
	searchTerm = "",
	pageIndex = 1,
	pageSize = 50,
} = {}) {
	const yearPaymentValue = filterTariffsByYear(report.formasPagamentoValor, year);
	const paymentQuantity = filterTariffsByYearMonth(report.formasPagamentoQuantidade, year, month);
	const paymentValue = filterTariffsByYearMonth(report.formasPagamentoValor, year, month);
	const collectionValue = filterTariffsByYearMonth(report.formasCobrancaValor, year, month);
	const monthly = aggregateTariffsMonthlySeries(yearPaymentValue, "method");
	const methods = addTariffsPercentOfTotal(aggregateTariffsByLabel(paymentValue, "method"));
	const totalQuantity = paymentQuantity.reduce(
		(sum, item) => sum + Number(item.quantity || 0),
		0,
	);
	const totalValue = paymentValue.reduce((sum, item) => sum + Number(item.value || 0), 0);
	return buildBaseViewModel({
		type: "formasPagamento",
		title: "Formas de Pagamento",
		subtitle: "Valores, quantidades, cobrança e ticket médio por forma de pagamento.",
		year,
		month,
		rows: [...paymentValue, ...collectionValue, ...paymentQuantity],
		kpis: [
			{ title: "Valor recebido", value: totalValue, type: "currency", icon: "CircleDollarSign", color: "emerald" },
			{ title: "Quantidade", value: totalQuantity, type: "number", icon: "ReceiptText", color: "blue" },
			{ title: "Ticket médio", value: totalQuantity ? totalValue / totalQuantity : 0, type: "currency", icon: "BadgeDollarSign", color: "amber" },
			{ title: "Principal forma", value: methods[0]?.label || "-", type: "text", icon: "Wallet", color: "violet" },
		],
		rankingTitle: "Ranking por forma de pagamento",
		doughnutRows: methods,
		monthlyChart: monthly,
		monthlyEmpty: !monthly.datasets?.length,
		tableMode: "paymentMethods",
		searchTerm,
		pageIndex,
		pageSize,
	});
}

export const TARIFFS_DETAIL_BUILDERS = {
	faturas: buildInvoicesDetailViewModel,
	recCliente: buildClientRevenueDetailViewModel,
	formasPagamento: buildPaymentMethodsDetailViewModel,
};
