const crypto = require("node:crypto");
const XLSX = require("xlsx");
const {
	applyAccessBudgetRowRules,
	isAccessProjectCenter,
	resolveAccessCompanyGroup,
	shouldKeepAccessImportedRow,
} = require("./financeiroBudgetAccessRules");

const MONTHS = [
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
];

const BUDGET_DETECTED_FIELDS = [
	"quebra",
	"data",
	"ano",
	"numMes",
	"mes",
	"fornecedor",
	"codConta",
	"nomeConta",
	"codCc",
	"nomeCc",
	"realizado",
	"empresa",
	"filial",
	"conta",
	"seqMov",
	"titulo",
	"tipo",
	"observacoes",
	"categoria",
	"entidade",
	"empresaId",
	"filialId",
	"cf",
	"cc",
];

function cleanText(value) {
	return String(value ?? "").trim();
}

function normalizeKey(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function rowHasValue(row = []) {
	return row.some((value) => cleanText(value));
}

function splitCodeName(value) {
	const text = cleanText(value);
	if (!text) return { codigo: "", nome: "", raw: "" };
	const match = text.match(/^\s*([^-–—]+?)\s*[-–—]\s*(.+)\s*$/);
	if (!match) return { codigo: "", nome: text, raw: text };
	return {
		codigo: cleanText(match[1]),
		nome: cleanText(match[2]),
		raw: text,
	};
}

function parseCurrency(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = cleanText(value)
		.replace(/[R$\s]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	const parsed = Number(normalized || 0);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function buildDateInfo(year, month, day) {
	const safeYear = Number(year);
	const safeMonth = Number(month);
	const safeDay = Number(day);
	const date = new Date(Date.UTC(safeYear, safeMonth - 1, safeDay));
	if (
		!Number.isFinite(safeYear) ||
		!Number.isFinite(safeMonth) ||
		!Number.isFinite(safeDay) ||
		date.getUTCFullYear() !== safeYear ||
		date.getUTCMonth() !== safeMonth - 1 ||
		date.getUTCDate() !== safeDay
	) {
		return {};
	}
	return {
		data: `${safeYear}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`,
		ano: safeYear,
		numMes: safeMonth,
		mes: MONTHS[safeMonth] || "",
	};
}

function parseDateInfo(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return buildDateInfo(value.getFullYear(), value.getMonth() + 1, value.getDate());
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const parsed = XLSX.SSF.parse_date_code(value);
		if (parsed?.y && parsed?.m && parsed?.d)
			return buildDateInfo(parsed.y, parsed.m, parsed.d);
	}
	const text = cleanText(value);
	const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (iso) return buildDateInfo(iso[1], iso[2], iso[3]);
	const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (br) {
		const first = Number(br[1]);
		const second = Number(br[2]);
		const year = Number(String(br[3]).length === 2 ? `20${br[3]}` : br[3]);
		return first > 12
			? buildDateInfo(year, second, first)
			: buildDateInfo(year, first, second);
	}
	return {};
}

function sourceKey(parts = []) {
	return crypto
		.createHash("sha256")
		.update(parts.map(cleanText).join("|"))
		.digest("hex")
		.slice(0, 24);
}

function withSource(row, meta) {
	const key = sourceKey([
		meta.fileName,
		meta.sheetName,
		meta.layout,
		meta.rowNumber,
		row.origem,
		row.titulo,
		row.tipo,
		row.codConta,
		row.codCc,
		row.sourceDateForKey || row.data,
		row.empresaId || row.empresa,
		row.filialId || row.filial,
		row.realizado,
	]);
	return {
		...applyAccessBudgetRowRules(row),
		id: row.id || `orc-${key}`,
		sourceKey: key,
		arquivoOrigem: meta.fileName,
		abaOrigem: meta.sheetName,
		linhaOrigem: meta.rowNumber,
		layoutOrigem: meta.layout,
	};
}

function normalizeFpcp106Row(row = [], meta) {
	const origem = cleanText(row[0]);
	const dateInfo = parseDateInfo(row[1]);
	const fornecedorParts = splitCodeName(row[2]);
	const account = splitCodeName(row[5]);
	const costCenter = splitCodeName(row[9]);
	const empresa = cleanText(row[13]);
	const filial = cleanText(row[14]);
	const conta = cleanText(row[15]);
	if (!origem || !dateInfo.data || !account.raw || !costCenter.raw) return null;
	return withSource(
		{
			quebra: origem,
			origem,
			data: dateInfo.data,
			ano: dateInfo.ano,
			numMes: dateInfo.numMes,
			mes: dateInfo.mes,
			fornecedor: cleanText(row[2]),
			codFornecedor: fornecedorParts.codigo,
			nomeFornecedor: fornecedorParts.nome,
			codConta: account.codigo,
			nomeConta: account.nome,
			codCc: costCenter.codigo,
			nomeCc: costCenter.nome,
			realizado: parseCurrency(row[12]),
			empresa,
			filial,
			conta,
			grupo: resolveAccessCompanyGroup(empresa),
			tipo: origem,
			categoria: account.nome,
			entidade: fornecedorParts.nome || cleanText(row[2]),
			empresaId: empresa,
			filialId: filial,
			banco: conta,
			cf: account.raw,
			cc: costCenter.raw,
		},
		meta,
	);
}

function normalizeFpcp302Row(row = [], company, meta) {
	const titulo = cleanText(row[0]);
	const tipo = cleanText(row[1]);
	const codConta = cleanText(row[2]);
	const nomeConta = cleanText(row[3]);
	const codCc = cleanText(row[7]);
	const nomeCc = cleanText(row[8]);
	const baseDateInfo = parseDateInfo(row[12]);
	const dueDateInfo = parseDateInfo(row[14]);
	const dateInfo = dueDateInfo.data ? dueDateInfo : baseDateInfo;
	if (!titulo || !tipo || !codConta || !nomeConta || !codCc || !nomeCc)
		return null;
	const observacoes = [
		baseDateInfo.data
			? `Data base: ${baseDateInfo.data}`
			: row[12]
				? `Data base: ${cleanText(row[12])}`
				: "",
		dueDateInfo.data
			? `Dt prev pgto: ${dueDateInfo.data}`
			: row[14]
				? `Dt prev pgto: ${cleanText(row[14])}`
				: "",
	]
		.filter(Boolean)
		.join(" | ");
	return withSource(
		{
			quebra: "CP",
			origem: "CP",
			data: dateInfo.data || "",
			ano: dateInfo.ano || "",
			numMes: dateInfo.numMes || "",
			mes: dateInfo.mes || "",
			fornecedor: company.nome,
			codConta,
			nomeConta,
			codCc,
			nomeCc,
			realizado: parseCurrency(row[15]),
			empresa: [company.codigo, company.nome].filter(Boolean).join(" - "),
			filial: "",
			conta: "",
			seqMov: titulo,
			titulo,
			tipo,
			observacoes,
			categoria: nomeConta,
			entidade: company.nome,
			empresaId: company.codigo,
			grupo: resolveAccessCompanyGroup(company.codigo),
			filialId: "",
			cf: `${codConta} - ${nomeConta}`,
			cc: `${codCc} - ${nomeCc}`,
			sourceDateForKey: baseDateInfo.data || dueDateInfo.data || "",
		},
		meta,
	);
}

function detectLayout(rows = []) {
	const first = rows.find(rowHasValue) || [];
	if (
		normalizeKey(first[0]) === "origem" &&
		normalizeKey(first[1]).includes("datamovimento")
	) {
		return "fpcp106";
	}
	if (
		rows.some(
			(row) =>
				normalizeKey(row[0]).includes("ntitulo") ||
				normalizeKey(row[0]).includes("titulo"),
		)
	) {
		return "fpcp302";
	}
	return "generic";
}

function parseFpcp106Rows(rows = [], meta = {}) {
	return rows
		.slice(1)
		.map((row, index) =>
			normalizeFpcp106Row(row, {
				...meta,
				layout: "FPCP106",
				rowNumber: index + 2,
			}),
		)
		.filter(Boolean);
}

function parseFpcp302Rows(rows = [], meta = {}) {
	const parsedRows = [];
	let currentCompany = { codigo: "", nome: "" };
	rows.forEach((row, index) => {
		const first = cleanText(row[0]);
		const second = cleanText(row[1]);
		const fifth = cleanText(row[4]);
		const isCompanyHeader =
			/^\d{4}$/.test(first) &&
			second &&
			(!cleanText(row[2]) || /contas\s+a\s+pagar/i.test(fifth));
		if (isCompanyHeader) {
			currentCompany = { codigo: first, nome: second };
			return;
		}
		if (
			normalizeKey(first).includes("titulo") ||
			!currentCompany.codigo ||
			!rowHasValue(row)
		) {
			return;
		}
		const normalized = normalizeFpcp302Row(row, currentCompany, {
			...meta,
			layout: "FPCP302",
			rowNumber: index + 1,
		});
		if (normalized && shouldKeepAccessImportedRow(normalized)) {
			parsedRows.push(normalized);
		}
	});
	return parsedRows;
}

function parseGenericRows(rows = [], meta = {}) {
	const [header = [], ...body] = rows;
	const headers = header.map(cleanText);
	return body
		.map((row, index) => {
			const objectRow = Object.fromEntries(
				headers.map((headerName, columnIndex) => [headerName, row[columnIndex]]),
			);
			return withSource(objectRow, {
				...meta,
				layout: "GENERIC",
				rowNumber: index + 2,
			});
		})
		.filter((row) => Object.values(row).some((value) => cleanText(value)));
}

function parseBudgetWorkbookBuffer(buffer, fileName = "orcamento.xlsx") {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
	const rows = [];
	const files = [];
	for (const sheetName of workbook.SheetNames) {
		const worksheet = workbook.Sheets[sheetName];
		const sheetRows = XLSX.utils.sheet_to_json(worksheet, {
			header: 1,
			raw: true,
			defval: "",
		});
		const layout = detectLayout(sheetRows);
		const meta = { fileName, sheetName };
		const parsed =
			layout === "fpcp106"
				? parseFpcp106Rows(sheetRows, meta)
				: layout === "fpcp302"
					? parseFpcp302Rows(sheetRows, meta)
					: parseGenericRows(sheetRows, meta);
		files.push({
			fileName,
			sheetName,
			layout: layout.toUpperCase(),
			rows: parsed.length,
		});
		rows.push(...parsed);
	}
	return {
		rows,
		detectedFields: BUDGET_DETECTED_FIELDS.filter((field) =>
			rows.some((row) => cleanText(row[field])),
		),
		files,
	};
}

module.exports = {
	detectLayout,
	parseBudgetWorkbookBuffer,
	parseFpcp106Rows,
	parseFpcp302Rows,
	__testables: {
		isFpcp302ProjectRow: isAccessProjectCenter,
		normalizeFpcp106Row,
		normalizeFpcp302Row,
		parseDateInfo,
	},
};

