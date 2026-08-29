import {
	aggregateBillingClients,
	aggregateInvoiceNetByMonth,
	aggregateTariffsByLabel,
	buildTariffsInsights,
	filterTariffsByYearMonth,
	invoiceMetricType,
	tariffBudgetMonthName,
} from "../../modules/financeiro/utils/tariffsViewModels";

const MONTHS_SHORT = [
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

const EMPTY_SERASA_LIST = [];

function normalizeText(value = "") {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function dateFromInput(value) {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSerasaClientMarker(row = {}) {
	const text = normalizeText([row.type, row.description, row.operation].join(" "));
	return /\b(clientes?|usuarios?|usuarias?|base\s+serasa|qtd\s+clientes?)\b/.test(
		text,
	);
}

function isSerasaNetRevenue(row = {}) {
	return (
		row.isNetRevenue ||
		row.direction === "receita_liquida" ||
		String(row.operation || "").trim().toLowerCase() === "receita líquida" ||
		String(row.operation || "").trim() === "-"
	);
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

function getSerasaRowDate(row = {}) {
	return dateFromInput(row.date);
}

function serasaRowMatchesMonth(row = {}, reference = {}) {
	const date = getSerasaRowDate(row);
	if (!date) return false;
	const year = Number(row.year || date.getFullYear());
	const month = Number(row.month || date.getMonth() + 1);
	return (
		year === Number(reference.year) &&
		month === Number(reference.month)
	);
}

function serasaClientHistoryMatchesMonth(item = {}, reference = {}) {
	return (
		Number(item.year || 0) === Number(reference.year) &&
		Number(item.month || 0) === Number(reference.month)
	);
}

function resolveSerasaClients(clientesHistory = [], reference = {}) {
	return (
		[...(clientesHistory || [])]
			.filter((item) => serasaClientHistoryMatchesMonth(item, reference))
			.sort((a, b) => String(b.key || "").localeCompare(String(a.key || "")))[0]
			?.clientes || 0
	);
}

function summarizeSerasaRows(rows = [], clientesHistory = [], reference = {}) {
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
			const monthKey =
				year && month ? `${year}-${String(month).padStart(2, "0")}` : "";
			const currentMonth = monthly.get(monthKey) || {
				key: monthKey,
				label: `${MONTHS_SHORT[month - 1] || "Sem"}/${String(year).slice(-2)}`,
				entradas: 0,
				saidas: 0,
				receitaLiquida: 0,
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
				operationTotals.set(
					"Saídas",
					(operationTotals.get("Saídas") || 0) + absoluteValue,
				);
			} else if (value > 0 || row.direction === "entrada") {
				acc.totalEntradas += absoluteValue;
				currentMonth.entradas += absoluteValue;
				operationTotals.set(
					"Entradas",
					(operationTotals.get("Entradas") || 0) + absoluteValue,
				);
			}

			if (monthKey) monthly.set(monthKey, currentMonth);
			return acc;
		},
		{
			totalEntradas: 0,
			totalSaidas: 0,
			receitaLiquida: 0,
			clientes: resolveSerasaClients(clientesHistory, reference),
			ticketMedio: 0,
		},
	);
	const entryRows = uniqueRows.filter(
		(row) => Number(row.value || 0) > 0 && !isSerasaNetRevenue(row),
	);
	summary.ticketMedio = entryRows.length
		? summary.totalEntradas / entryRows.length
		: 0;
	return {
		summary,
		monthly: [...monthly.values()].sort((a, b) =>
			String(a.key).localeCompare(String(b.key)),
		),
		operationTotals: [...operationTotals.entries()]
			.map(([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value),
	};
}

function buildBillingClientsSeries(tarifasReport = {}, reference = {}) {
	const rows = filterTariffsByYearMonth(
		tarifasReport.formasCobrancaClientes || [],
		reference.year,
		reference.month,
	);
	return aggregateBillingClients(rows).slice(0, 8).map((item) => ({
		key: item.label,
		label: item.label,
		value: Number(item.customers || item.value || 0),
	}));
}

function buildInvoiceSnapshot(tarifasReport = {}, reference = {}) {
	const rows = filterTariffsByYearMonth(
		tarifasReport.faturas || [],
		reference.year,
		reference.month,
	);
	return rows.reduce(
		(acc, row) => {
			const value = Number(row.value || 0);
			const type = invoiceMetricType(row.metric);
			if (type === "Ativas") acc.active += value;
			if (type === "Canceladas") acc.canceled += value;
			return acc;
		},
		{ active: 0, canceled: 0 },
	);
}

function calculateChange(current = 0, previous = 0) {
	if (!previous) return current ? 100 : 0;
	return ((current - previous) / Math.abs(previous)) * 100;
}

function resolveLastUpdated(...reports) {
	return reports
		.flatMap((report) => [
			report?.updatedAt,
			report?.lastUpdatedAt,
			report?.lastImportedAt,
			report?.summary?.updatedAt,
			report?.summary?.lastImportedAt,
		])
		.filter(Boolean)
		.map((value) => new Date(value))
		.filter((date) => !Number.isNaN(date.getTime()))
		.sort((a, b) => b.getTime() - a.getTime())[0];
}

function formatMonthOption(reference = {}) {
	return `${tariffBudgetMonthName(reference.month)} / ${reference.year}`;
}

function toCompactCards({ tarifasInsights, invoiceSnapshot, reference }) {
	const daysInMonth = new Date(reference.year, reference.month, 0).getDate();
	const today = new Date();
	const selectedIsCurrent =
		today.getFullYear() === Number(reference.year) &&
		today.getMonth() + 1 === Number(reference.month);
	const elapsedDays = selectedIsCurrent ? today.getDate() : daysInMonth;
	const weeklyForecast =
		elapsedDays > 0 ? (tarifasInsights.kpis.totalPagamentos / elapsedDays) * 7 : 0;
	const totalInvoices = invoiceSnapshot.active + invoiceSnapshot.canceled;
	const delinquency = totalInvoices
		? (invoiceSnapshot.canceled / totalInvoices) * 100
		: 0;
	const topClient = tarifasInsights.topClientes?.[0];

	return [
		{
			title: "Recebidos hoje",
			value: 0,
			type: "number",
			tone: "green",
			icon: "money",
			meta: "Pagamentos recebidos",
		},
		{
			title: "Vencidos hoje",
			value: 0,
			type: "number",
			tone: "orange",
			icon: "calendar",
			meta: "Notas vencidas",
		},
		{
			title: "Contas pagas na semana",
			value: tarifasInsights.kpis.totalPagamentos,
			type: "number",
			tone: "blue",
			icon: "clipboard",
			meta: "Formas de pagamento lidas",
		},
		{
			title: "Inadimplência atual",
			value: delinquency,
			type: "percent",
			tone: "red",
			icon: "alert",
			meta: "Canceladas sobre total",
		},
		{
			title: "Pagamentos no mês",
			value: tarifasInsights.kpis.totalPagamentos,
			type: "number",
			tone: "green",
			icon: "wallet",
			meta: "Registros de pagamento",
		},
		{
			title: "Boletos vencidos",
			value: 0,
			type: "number",
			tone: "orange",
			icon: "invoice",
			meta: "Aguardando boletos",
		},
		{
			title: "Previsão de recebimento da semana",
			value: weeklyForecast,
			type: "number",
			tone: "blue",
			icon: "trend",
			meta: "Previsão por quantidade",
		},
		{
			title: "Contas a receber hoje",
			value: 0,
			type: "number",
			tone: "cyan",
			icon: "user",
			meta: "Notas previstas",
		},
		{
			title: "Clientes por cobrança",
			value: tarifasInsights.kpis.totalClientesCobranca,
			type: "number",
			tone: "cyan",
			icon: "user",
			meta: "Base por forma de cobrança",
		},
		{
			title: "Maior cliente",
			value: "",
			type: "text",
			tone: "yellow",
			icon: "star",
			meta: topClient?.label || "Sem cliente",
			hideValue: true,
		},
	];
}

export function buildAcompanhamentoFinanceiroViewModel({
	serasaReport = {},
	tarifasReport = {},
	reference = {},
} = {}) {
	const selectedPeriod = {
		mode: "month",
		referenceYear: reference.year,
		referenceMonth: reference.month,
	};
	const previousReference =
		reference.month === 1
			? { year: reference.year - 1, month: 12 }
			: { year: reference.year, month: reference.month - 1 };
	const previousPeriod = {
		mode: "month",
		referenceYear: previousReference.year,
		referenceMonth: previousReference.month,
	};
	const serasaRows = serasaReport.rows || EMPTY_SERASA_LIST;
	const serasaCurrentRows = serasaRows.filter((row) =>
		serasaRowMatchesMonth(row, reference),
	);
	const serasaPreviousRows = serasaRows.filter((row) =>
		serasaRowMatchesMonth(row, previousReference),
	);
	const serasaCurrent = summarizeSerasaRows(
		serasaCurrentRows,
		serasaReport.clientesHistory || EMPTY_SERASA_LIST,
		reference,
	).summary;
	const serasaPrevious = summarizeSerasaRows(
		serasaPreviousRows,
		serasaReport.clientesHistory || EMPTY_SERASA_LIST,
		previousReference,
	).summary;
	const tarifasInsights = buildTariffsInsights(tarifasReport, selectedPeriod);
	const previousTarifasInsights = buildTariffsInsights(tarifasReport, previousPeriod);
	const invoiceSnapshot = buildInvoiceSnapshot(tarifasReport, reference);
	const previousInvoiceSnapshot = buildInvoiceSnapshot(tarifasReport, previousReference);
	const billingClientsSeries = buildBillingClientsSeries(tarifasReport, reference);
	const paymentRanking = aggregateTariffsByLabel(
		tarifasInsights.formasPagamentoQuantidade,
		"method",
		"quantity",
	).slice(0, 4);
	const invoiceMonths = aggregateInvoiceNetByMonth(tarifasReport.faturas || []);
	const lastUpdated = resolveLastUpdated(serasaReport, tarifasReport);

	return {
		reference,
		periodLabel: formatMonthOption(reference),
		lastUpdated,
		kpis: [
			{
				id: "faturamento",
				title: "Notas no mês",
				value: invoiceSnapshot.active + invoiceSnapshot.canceled,
				type: "number",
				icon: "revenue",
				trend: calculateChange(
					invoiceSnapshot.active + invoiceSnapshot.canceled,
					previousInvoiceSnapshot.active + previousInvoiceSnapshot.canceled,
				),
			},
			{
				id: "clientes",
				title: "Clientes base mês Serasa",
				value: serasaCurrent.clientes,
				type: "number",
				icon: "users",
				trend: calculateChange(serasaCurrent.clientes, serasaPrevious.clientes),
			},
			{
				id: "ticket",
				title: "Pagamentos no mês",
				value: tarifasInsights.kpis.totalPagamentos,
				type: "number",
				icon: "tag",
				featured: true,
				trend: calculateChange(
					tarifasInsights.kpis.totalPagamentos,
					previousTarifasInsights.kpis.totalPagamentos,
				),
			},
			{
				id: "receitaLiquida",
				title: "Movimentações Serasa mês",
				value: serasaCurrentRows.length,
				type: "number",
				icon: "coin",
				trend: calculateChange(
					serasaCurrentRows.length,
					serasaPreviousRows.length,
				),
			},
			{
				id: "faturas",
				title: "Faturas ativas no mês / cancelada",
				value: `${Math.trunc(invoiceSnapshot.active).toLocaleString("pt-BR")} / ${Math.trunc(invoiceSnapshot.canceled).toLocaleString("pt-BR")}`,
				type: "text",
				icon: "invoice",
				trend: calculateChange(
					invoiceSnapshot.canceled,
					previousInvoiceSnapshot.canceled,
				),
				invertedTrend: true,
			},
		],
		billingClientsSeries,
		paymentRanking,
		invoiceSnapshot,
		invoiceMonths,
		compactCards: toCompactCards({
			serasaSummary: serasaCurrent,
			tarifasInsights,
			invoiceSnapshot,
			reference,
		}),
	};
}
