import ExcelJS from "exceljs";

export const METAS_CENTRAL_REPORT_ITEMS = [
	{ id: "resumo", label: "Resumo do mês" },
	{ id: "tecnicos_sempre", label: "Técnicos Sempre" },
	{ id: "tecnicos_onnet", label: "Técnicos Onnet" },
	{ id: "regionais_sempre", label: "Regionais Sempre" },
	{ id: "regionais_onnet", label: "Regionais Onnet" },
	{ id: "regionais_todos", label: "Regionais Todos" },
	{ id: "agentes", label: "Agente autorizado Sempre" },
	{ id: "loja_agente", label: "Entrega loja agente" },
	{ id: "loja_sempre", label: "Entrega loja Sempre" },
	{ id: "loja_onnet", label: "Entrega loja Onnet" },
	{ id: "loja_todos", label: "Entrega loja Todos" },
	{ id: "diario_todos", label: "Entrega diária Todos" },
];

const MONTHS = [
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
];

function formatNumber(value) {
	return Number(value || 0);
}

function slugify(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function sheetName(value) {
	return String(value || "Relatório").slice(0, 31);
}

function triggerWorkbookDownload(buffer, fileName) {
	const blob = new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function styleHeader(row) {
	row.font = { bold: true, color: { argb: "FFFFFFFF" } };
	row.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FF1D4ED8" },
	};
}

function daysCount(records = []) {
	return Math.max(
		31,
		...records.map((record) =>
			Math.max(
				Array.isArray(record?.daily) ? record.daily.length : 0,
				Array.isArray(record?.lojaAgentesDaily)
					? record.lojaAgentesDaily.length
					: 0,
			),
		),
	);
}

function dayHeaders(totalDays) {
	return Array.from({ length: totalDays }, (_, index) => `Dia ${index + 1}`);
}

function addSheet(workbook, name, headers, rows) {
	const sheet = workbook.addWorksheet(sheetName(name));
	sheet.addRow(headers);
	styleHeader(sheet.getRow(1));
	rows.forEach((row) => sheet.addRow(row));
	sheet.views = [{ state: "frozen", ySplit: 1 }];
	sheet.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: 1, column: headers.length },
	};
	sheet.columns = headers.map((header, index) => ({
		width: index === 0 ? 34 : Math.max(12, String(header).length + 2),
	}));
}

function getRecord(allData = {}, month, source) {
	const monthData = allData?.[month] || {};
	if (source === "onnet") return monthData.onnet || null;
	if (source === "todos") return monthData.onnetSempre || monthData || null;
	return monthData || null;
}

function normalizePerformanceRows(items = [], label = "Nome") {
	const totalDays = daysCount(items);
	return {
		headers: [label, "Total", "Meta", "%", ...dayHeaders(totalDays)],
		rows: items.map((item) => [
			item.name || item.nome || item.cidade || "-",
			formatNumber(item.total),
			formatNumber(item.meta),
			formatNumber(item.percent ?? item.pct),
			...Array.from({ length: totalDays }, (_, index) =>
				formatNumber(item.daily?.[index]),
			),
		]),
	};
}

function normalizeStoreRows(records = [], label = "Fonte") {
	const totalDays = Math.max(
		31,
		...records.map((record) => record?.saldoDiario?.length || 0),
	);
	return {
		headers: [label, "Total", ...dayHeaders(totalDays)],
		rows: records.map(({ label: rowLabel, record }) => [
			rowLabel,
			formatNumber(record?.lojaTotal),
			...Array.from({ length: totalDays }, (_, index) =>
				formatNumber(record?.saldoDiario?.[index]?.loja),
			),
		]),
	};
}

function normalizeAgentStoreRows(items = []) {
	const totalDays = daysCount(items);
	return {
		headers: ["Cidade", "Total", ...dayHeaders(totalDays)],
		rows: items
			.filter((item) => Number(item.lojaAgentesTotal || 0) > 0)
			.map((item) => [
				item.nome || item.cidade || "-",
				formatNumber(item.lojaAgentesTotal),
				...Array.from({ length: totalDays }, (_, index) =>
					formatNumber(item.lojaAgentesDaily?.[index]),
				),
			]),
	};
}

function getAgentMonthRows(agentesData = {}, month) {
	const monthData = agentesData?.[month];
	if (Array.isArray(monthData)) return monthData;
	if (Array.isArray(monthData?.cidadesRanking)) return monthData.cidadesRanking;
	if (Array.isArray(monthData?.cidades)) return monthData.cidades;
	return [];
}

function normalizeDailyRows(record = null) {
	const rows = record?.saldoDiario || [];
	return {
		headers: [
			"Dia",
			"Técnicos",
			"Agente autorizado",
			"Loja",
			"Regionais",
			"Total dia",
			"Meta dia",
			"Saldo dia",
			"Saldo mês",
		],
		rows: rows.map((row) => [
			formatNumber(row.dia),
			formatNumber(row.equipe),
			formatNumber(row.agente),
			formatNumber(row.loja),
			formatNumber(row.regionais),
			formatNumber(row.totalDia),
			formatNumber(row.metaDia),
			formatNumber(row.saldoDia),
			formatNumber(row.saldoMes),
		]),
	};
}

function normalizeAgentsRows(items = []) {
	const totalDays = daysCount(items);
	return {
		headers: [
			"Cidade",
			"Cancelamentos",
			"Meta",
			"Realizado",
			"Falta",
			"%",
			...dayHeaders(totalDays),
		],
		rows: items.map((item) => [
			item.nome || item.cidade || "-",
			formatNumber(item.cancelamentos),
			formatNumber(item.meta80 ?? item.meta),
			formatNumber(item.realizado ?? item.total),
			formatNumber(item.falta),
			formatNumber(item.pct),
			...Array.from({ length: totalDays }, (_, index) =>
				formatNumber(item.daily?.[index]),
			),
		]),
	};
}

function addResumoSheet(workbook, month, allData) {
	const sempre = getRecord(allData, month, "sempre");
	const onnet = getRecord(allData, month, "onnet");
	const todos = getRecord(allData, month, "todos");
	addSheet(
		workbook,
		"Resumo",
		["Fonte", "Cancelamentos", "Meta", "Lançado", "%", "Loja", "Agente", "Regionais"],
		[
			["Sempre", sempre],
			["Onnet", onnet],
			["Todos", todos],
		].map(([label, record]) => [
			label,
			formatNumber(record?.cancelamentos),
			formatNumber(record?.meta),
			formatNumber(record?.totalOS),
			formatNumber(record?.percentAchieved),
			formatNumber(record?.lojaTotal),
			formatNumber(record?.agenteTotal),
			formatNumber(
				record?.regionais?.reduce(
					(sum, item) => sum + Number(item.total || 0),
					0,
				),
			),
		]),
	);
}

const REPORT_BUILDERS = {
	resumo: ({ workbook, month, allData }) => addResumoSheet(workbook, month, allData),
	tecnicos_sempre: ({ workbook, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "sempre")?.technicians,
			"Técnico",
		);
		addSheet(workbook, "Técnicos Sempre", data.headers, data.rows);
	},
	tecnicos_onnet: ({ workbook, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "onnet")?.technicians,
			"Técnico",
		);
		addSheet(workbook, "Técnicos Onnet", data.headers, data.rows);
	},
	regionais_sempre: ({ workbook, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "sempre")?.regionais,
			"Regional",
		);
		addSheet(workbook, "Regionais Sempre", data.headers, data.rows);
	},
	regionais_onnet: ({ workbook, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "onnet")?.regionais,
			"Regional",
		);
		addSheet(workbook, "Regionais Onnet", data.headers, data.rows);
	},
	regionais_todos: ({ workbook, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "todos")?.regionais,
			"Regional",
		);
		addSheet(workbook, "Regionais Todos", data.headers, data.rows);
	},
	agentes: ({ workbook, month, agentesData }) => {
		const data = normalizeAgentsRows(getAgentMonthRows(agentesData, month));
		addSheet(workbook, "Agentes Sempre", data.headers, data.rows);
	},
	loja_agente: ({ workbook, month, agentesData }) => {
		const data = normalizeAgentStoreRows(getAgentMonthRows(agentesData, month));
		addSheet(workbook, "Loja Agente", data.headers, data.rows);
	},
	loja_sempre: ({ workbook, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Entregue em loja Sempre", record: getRecord(allData, month, "sempre") },
		]);
		addSheet(workbook, "Loja Sempre", data.headers, data.rows);
	},
	loja_onnet: ({ workbook, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Entregue em loja Onnet", record: getRecord(allData, month, "onnet") },
		]);
		addSheet(workbook, "Loja Onnet", data.headers, data.rows);
	},
	loja_todos: ({ workbook, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Sempre", record: getRecord(allData, month, "sempre") },
			{ label: "Onnet", record: getRecord(allData, month, "onnet") },
			{ label: "Todos", record: getRecord(allData, month, "todos") },
		]);
		addSheet(workbook, "Loja Todos", data.headers, data.rows);
	},
	diario_todos: ({ workbook, month, allData }) => {
		const data = normalizeDailyRows(getRecord(allData, month, "todos"));
		addSheet(workbook, "Diário Todos", data.headers, data.rows);
	},
};

export function getAvailableMetasReportMonths(allData = {}, agentesData = {}) {
	return MONTHS.filter((month) => {
		const monthData = allData?.[month];
		const agentMonth = agentesData?.[month];
		return Boolean(
				Number(monthData?.totalOS || 0) > 0 ||
				Number(monthData?.onnet?.totalOS || 0) > 0 ||
				Number(monthData?.onnetSempre?.totalOS || 0) > 0 ||
				getAgentMonthRows(agentesData, month).length > 0 ||
				(Array.isArray(agentMonth?.cidades) && agentMonth.cidades.length > 0),
		);
	});
}

export async function exportMetasCentralReport({
	month,
	allData = {},
	agentesData = {},
	selectedItems = [],
}) {
	const itemIds = selectedItems.length
		? selectedItems
		: METAS_CENTRAL_REPORT_ITEMS.map((item) => item.id);
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Cluster MG";
	workbook.created = new Date();

	itemIds.forEach((itemId) => {
		REPORT_BUILDERS[itemId]?.({ workbook, month, allData, agentesData });
	});

	if (!workbook.worksheets.length) {
		throw new Error("Selecione pelo menos um item para baixar.");
	}

	const buffer = await workbook.xlsx.writeBuffer();
	triggerWorkbookDownload(
		buffer,
		`relatorio-metas-${slugify(month)}-${new Date().getFullYear()}.xlsx`,
	);
	return { worksheets: workbook.worksheets.length };
}
