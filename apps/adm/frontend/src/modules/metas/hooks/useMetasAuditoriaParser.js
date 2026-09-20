import * as XLSX from "xlsx";

const AG_ABA_MES = {
	AG_JAN: "Janeiro",
	AG_FEV: "Fevereiro",
	AG_MAR: "Marco",
	AG_ABR: "Abril",
	AG_MAI: "Maio",
	AG_JUN: "Junho",
	AG_JUL: "Julho",
	AG_AGO: "Agosto",
	AG_SET: "Setembro",
	AG_OUT: "Outubro",
	AG_NOV: "Novembro",
	AG_DEZ: "Dezembro",
};

function normalizaAba(nome) {
	return nome
		.replace(/[^\w\s]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.toUpperCase();
}

function cvCell(ws, row, col) {
	const addr = XLSX.utils.encode_cell({ r: row, c: col });
	const cell = ws[addr];
	if (!cell || cell.v === undefined || cell.v === null || cell.v === "")
		return 0;
	const n = Number.parseFloat(cell.v);
	return Number.isNaN(n) ? 0 : n;
}

function normalizaTexto(valor) {
	return String(valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toUpperCase();
}

const CITY_DISPLAY_ALIASES = {
	AGUIANIL: "Aguanil",
};

function normalizaCidade(valor) {
	const cidade = String(valor ?? "").trim();
	if (!cidade) return "";

	return CITY_DISPLAY_ALIASES[normalizaTexto(cidade)] || cidade;
}

function deduplicarCidades(cidades = []) {
	const map = new Map();

	cidades.forEach((cidade) => {
		const nome = normalizaCidade(cidade?.cidade);
		const key = normalizaTexto(nome);
		if (!key) return;
		map.set(key, { ...cidade, cidade: nome });
	});

	return [...map.values()];
}

function findHeaderRow(ws, range) {
	for (let row = range.s.r; row <= range.e.r; row++) {
		const primeiraColuna = normalizaTexto(
			ws[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v,
		);
		const segundaColuna = normalizaTexto(
			ws[XLSX.utils.encode_cell({ r: row, c: 1 })]?.v,
		);
		if (primeiraColuna === "CIDADE" && segundaColuna === "1") {
			return row;
		}
	}

	return -1;
}

function getDayColumns(ws, headerRow, range) {
	const dayCols = [];

	for (let col = 1; col <= range.e.c; col++) {
		const valor = normalizaTexto(
			ws[XLSX.utils.encode_cell({ r: headerRow, c: col })]?.v,
		);
		const dia = Number(valor);
		if (Number.isInteger(dia) && dia >= 1 && dia <= 31) {
			dayCols.push(col);
			continue;
		}

		if (dayCols.length > 0) break;
	}

	return dayCols;
}

function findColumnByHeader(ws, headerRow, range, matcher) {
	for (let col = 0; col <= range.e.c; col++) {
		const valor = normalizaTexto(
			ws[XLSX.utils.encode_cell({ r: headerRow, c: col })]?.v,
		);
		if (matcher(valor)) return col;
	}

	return -1;
}

// Extraido do for de parseAgentesWorkbook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — processa uma linha de cidade da planilha,
// mesma logica de antes. Devolve `{ stop: true }` quando a linha marca o
// fim da tabela (mesmo `break` original), `null` quando a linha deve ser
// ignorada (mesmo `continue` original), ou a linha construida.
function buildCidadeRow(ws, row, { dayCols, totalCol, cancelCol, metaCol }) {
	const cidadeAddr = XLSX.utils.encode_cell({ r: row, c: 0 });
	const cidadeCell = ws[cidadeAddr];
	const cidade = normalizaCidade(cidadeCell?.v);
	const cidadeNormalizada = normalizaTexto(cidade);

	if (!cidade) return null;

	if (
		cidadeNormalizada === "CIDADE" ||
		cidadeNormalizada.startsWith("ENTREGA EM LOJA") ||
		cidadeNormalizada.startsWith("TOTAL")
	) {
		return { stop: true };
	}

	const daily = dayCols.map((col) => cvCell(ws, row, col));

	const total =
		totalCol >= 0
			? cvCell(ws, row, totalCol) || daily.reduce((s, v) => s + v, 0)
			: daily.reduce((s, v) => s + v, 0);
	const cancelamentos = cancelCol >= 0 ? cvCell(ws, row, cancelCol) : 0;
	const meta = metaCol >= 0 ? cvCell(ws, row, metaCol) : 0;

	const pct =
		meta > 0 ? Number.parseFloat(((total / meta) * 100).toFixed(1)) : 0;
	return { cidade, total, cancelamentos, meta, pct, daily };
}

// Extraido de parseAgentesWorkbook (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — parseia uma aba do mes, mesma logica de
// antes. Devolve a lista de cidades (ja deduplicada) ou null quando a
// aba nao existe/nao tem tabela reconhecivel (mesmo `continue` original).
function parseAgentesSheet(wb, chave) {
	const realName = wb.SheetNames.find((n) => normalizaAba(n).includes(chave));
	if (!realName) return null;

	const ws = wb.Sheets[realName];
	if (!ws || !ws["!ref"]) return null;

	const range = XLSX.utils.decode_range(ws["!ref"]);
	const headerRow = findHeaderRow(ws, range);
	if (headerRow < 0) return null;

	const dayCols = getDayColumns(ws, headerRow, range);
	if (dayCols.length === 0) return null;

	const totalCol = findColumnByHeader(
		ws,
		headerRow,
		range,
		(valor) => valor === "TOTAL",
	);
	const cancelCol = findColumnByHeader(ws, headerRow, range, (valor) =>
		valor.includes("CANCEL"),
	);
	const metaCol = findColumnByHeader(
		ws,
		headerRow,
		range,
		(valor) => valor === "META",
	);

	const cidades = [];
	for (let row = headerRow + 1; row <= range.e.r; row++) {
		const cidadeRow = buildCidadeRow(ws, row, {
			dayCols,
			totalCol,
			cancelCol,
			metaCol,
		});
		if (cidadeRow === null) continue;
		if (cidadeRow.stop) break;
		cidades.push(cidadeRow);
	}

	return cidades.length > 0 ? deduplicarCidades(cidades) : null;
}

export function parseAgentesWorkbook(wb) {
	const resultado = {};

	for (const [chave, mes] of Object.entries(AG_ABA_MES)) {
		const cidades = parseAgentesSheet(wb, chave);
		if (cidades) resultado[mes] = cidades;
	}

	return resultado;
}
