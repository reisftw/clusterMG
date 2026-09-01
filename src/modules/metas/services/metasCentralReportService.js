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

function addReportSection(sections, name, headers, rows) {
	sections.push({
		name: sheetName(name),
		headers,
		rows: rows.map((row) => row.map((value) => String(value ?? ""))),
	});
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

function addResumoSection(sections, month, allData) {
	const sempre = getRecord(allData, month, "sempre");
	const onnet = getRecord(allData, month, "onnet");
	const todos = getRecord(allData, month, "todos");
	addReportSection(
		sections,
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
	resumo: ({ sections, month, allData }) => addResumoSection(sections, month, allData),
	tecnicos_sempre: ({ sections, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "sempre")?.technicians,
			"Técnico",
		);
		addReportSection(sections, "Técnicos Sempre", data.headers, data.rows);
	},
	tecnicos_onnet: ({ sections, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "onnet")?.technicians,
			"Técnico",
		);
		addReportSection(sections, "Técnicos Onnet", data.headers, data.rows);
	},
	regionais_sempre: ({ sections, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "sempre")?.regionais,
			"Regional",
		);
		addReportSection(sections, "Regionais Sempre", data.headers, data.rows);
	},
	regionais_onnet: ({ sections, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "onnet")?.regionais,
			"Regional",
		);
		addReportSection(sections, "Regionais Onnet", data.headers, data.rows);
	},
	regionais_todos: ({ sections, month, allData }) => {
		const data = normalizePerformanceRows(
			getRecord(allData, month, "todos")?.regionais,
			"Regional",
		);
		addReportSection(sections, "Regionais Todos", data.headers, data.rows);
	},
	agentes: ({ sections, month, agentesData }) => {
		const data = normalizeAgentsRows(getAgentMonthRows(agentesData, month));
		addReportSection(sections, "Agentes Sempre", data.headers, data.rows);
	},
	loja_agente: ({ sections, month, agentesData }) => {
		const data = normalizeAgentStoreRows(getAgentMonthRows(agentesData, month));
		addReportSection(sections, "Loja Agente", data.headers, data.rows);
	},
	loja_sempre: ({ sections, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Entregue em loja Sempre", record: getRecord(allData, month, "sempre") },
		]);
		addReportSection(sections, "Loja Sempre", data.headers, data.rows);
	},
	loja_onnet: ({ sections, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Entregue em loja Onnet", record: getRecord(allData, month, "onnet") },
		]);
		addReportSection(sections, "Loja Onnet", data.headers, data.rows);
	},
	loja_todos: ({ sections, month, allData }) => {
		const data = normalizeStoreRows([
			{ label: "Sempre", record: getRecord(allData, month, "sempre") },
			{ label: "Onnet", record: getRecord(allData, month, "onnet") },
			{ label: "Todos", record: getRecord(allData, month, "todos") },
		]);
		addReportSection(sections, "Loja Todos", data.headers, data.rows);
	},
	diario_todos: ({ sections, month, allData }) => {
		const data = normalizeDailyRows(getRecord(allData, month, "todos"));
		addReportSection(sections, "Diário Todos", data.headers, data.rows);
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
	const sections = [];

	itemIds.forEach((itemId) => {
		REPORT_BUILDERS[itemId]?.({ sections, month, allData, agentesData });
	});

	if (!sections.length) {
		throw new Error("Selecione pelo menos um item para baixar.");
	}

	const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
		import("jspdf"),
		import("jspdf-autotable"),
	]);
	const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
	const generatedAt = new Date().toLocaleString("pt-BR");
	let y = 14;

	doc.setFont("helvetica", "bold");
	doc.setFontSize(16);
	doc.text(`Relatório de Metas - ${month}`, 14, y);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(9);
	doc.text(`Gerado em ${generatedAt}`, 14, y + 6);
	y += 14;

	sections.forEach((section, index) => {
		if (index > 0) {
			doc.addPage();
			y = 14;
		}
		doc.setFont("helvetica", "bold");
		doc.setFontSize(12);
		doc.text(section.name, 14, y);
		autoTable(doc, {
			startY: y + 5,
			head: [section.headers],
			body: section.rows,
			styles: {
				fontSize: section.headers.length > 16 ? 6 : 8,
				cellPadding: 1.4,
				overflow: "linebreak",
			},
			headStyles: {
				fillColor: [29, 78, 216],
				textColor: 255,
				fontStyle: "bold",
			},
			alternateRowStyles: { fillColor: [248, 250, 252] },
			margin: { left: 10, right: 10 },
		});
	});

	doc.save(`relatorio-metas-${slugify(month)}-${new Date().getFullYear()}.pdf`);
	return { sections: sections.length };
}
