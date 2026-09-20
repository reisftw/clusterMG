// Roteiro Finan #35 (Fase 4B — Importador universal com templates,
// estende #17): diferente de financeiroBudgetXlsxImport.js (layout
// fixo, feito sob medida pros relatórios FPCP106/FPCP302 do Sênior),
// aqui o usuário mapeia QUALQUER planilha manualmente ("Coluna A =
// fornecedor") e salva esse mapeamento como template pra reaplicar
// depois — sem precisar reconfigurar toda vez que o sistema externo
// mudar o layout do arquivo exportado.
//
// v1 restrito a uma entidade-alvo (fornecedores) — a mais simples de
// upsertar com segurança (chave natural clara: CNPJ, com fallback pro
// nome). Evoluir pra outras entidades (notas, contas a pagar) e questão
// de adicionar outro UPSERT_HANDLERS[entidade], sem mudar preview/
// template/aplicar.
const XLSX = require("xlsx");
const db = require("../db");
const { randomId } = require("../secureRandom");

const TARGET_FIELDS = {
	fornecedores: [
		{ key: "nome", label: "Nome", required: true },
		{ key: "codigo", label: "Código", required: false },
		{ key: "cnpj", label: "CNPJ", required: false },
	],
	// Roteiro Finan #48 (Conciliação inteligente): extrato bancário
	// importado via Central de Importações — mesma UI/mapeamento de
	// colunas do resto do importador universal, só troca a entidade-alvo.
	extrato_bancario: [
		{ key: "data", label: "Data", required: true },
		{ key: "descricao", label: "Descrição", required: true },
		{ key: "valor", label: "Valor", required: true },
	],
};

function getTargetFields(entidade) {
	return TARGET_FIELDS[entidade] || [];
}

function cleanText(value) {
	if (value === null || value === undefined) return "";
	return String(value).trim();
}

function onlyDigits(value) {
	return cleanText(value).replace(/\D/g, "");
}

// Le a primeira aba com dados da planilha e devolve as colunas
// detectadas (pelo cabecalho, linha 1) + uma amostra das proximas linhas
// — usado tanto no preview (usuario ainda vai mapear) quanto, com o
// mapeamento pronto, pra aplicar um template.
function parseWorkbookBuffer(buffer, { sheetName } = {}) {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
	const targetSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
	if (!targetSheet) throw new Error("A planilha não tem nenhuma aba com dados.");
	const worksheet = workbook.Sheets[targetSheet];
	const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
	const headerRow = rows.find((row) => row.some((cell) => cleanText(cell)));
	if (!headerRow) throw new Error("Não encontrei uma linha de cabeçalho com dados na planilha.");
	const columns = headerRow.map((cell, index) => cleanText(cell) || `Coluna ${index + 1}`);
	const headerIndex = rows.indexOf(headerRow);
	const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cleanText(cell)));
	const rowsAsObjects = dataRows.map((row) =>
		Object.fromEntries(columns.map((col, index) => [col, cleanText(row[index])])),
	);
	return {
		sheetName: targetSheet,
		sheetNames: workbook.SheetNames,
		columns,
		totalRows: rowsAsObjects.length,
		sampleRows: rowsAsObjects.slice(0, 10),
		rows: rowsAsObjects,
	};
}

// Aplica o mapeamento { campoAlvo: nomeDaColuna } sobre as linhas já
// convertidas em objetos (parseWorkbookBuffer().rows) — puro, sem banco,
// fácil de testar isolado.
function applyMapping(rows, mapping = {}, entidade) {
	const fields = getTargetFields(entidade);
	return rows.map((row) => {
		const record = {};
		fields.forEach((field) => {
			const sourceColumn = mapping[field.key];
			record[field.key] = sourceColumn ? cleanText(row[sourceColumn]) : "";
		});
		return record;
	});
}

function validateMappedRecords(records, entidade) {
	const fields = getTargetFields(entidade);
	const requiredFields = fields.filter((field) => field.required).map((field) => field.key);
	const valid = [];
	const invalid = [];
	records.forEach((record, index) => {
		const missing = requiredFields.filter((key) => !record[key]);
		if (missing.length) {
			invalid.push({ index, record, missing });
		} else {
			valid.push(record);
		}
	});
	return { valid, invalid };
}

async function upsertFornecedores(records, { createdBy } = {}) {
	let created = 0;
	let updated = 0;
	for (const record of records) {
		const cnpjDigits = onlyDigits(record.cnpj);
		const existing = await db.query(
			cnpjDigits
				? `select id from finan_fornecedores where regexp_replace(coalesce(cnpj,''), '\\D', '', 'g') = $1 limit 1`
				: `select id from finan_fornecedores where lower(nome) = lower($1) limit 1`,
			[cnpjDigits || record.nome],
		);
		if (existing.rows[0]) {
			await db.query(
				`update finan_fornecedores set
					nome = $2,
					codigo = coalesce(nullif($3, ''), codigo),
					cnpj = coalesce(nullif($4, ''), cnpj),
					updated_at = now(),
					updated_by = $5
				where id = $1`,
				[existing.rows[0].id, record.nome, record.codigo || "", record.cnpj || "", createdBy?.id || null],
			);
			updated += 1;
			// Roteiro Finan #47 (Webhooks): supplier.updated. Melhor esforco.
			require("../webhooks/dispatchService")
				.dispatchEvent("supplier.updated", { id: existing.rows[0].id, nome: record.nome, cnpj: record.cnpj || "" })
				.catch(() => {});
		} else {
			await db.query(
				`insert into finan_fornecedores (id, codigo, nome, cnpj, status, created_at, updated_at, created_by, updated_by)
				values ($1, $2, $3, $4, 'ativo', now(), now(), $5, $5)`,
				[randomId("fornecedor"), record.codigo || "", record.nome, record.cnpj || "", createdBy?.id || null],
			);
			created += 1;
		}
	}
	return { created, updated, total: records.length };
}

// Aceita "1.234,56" (BR) ou "1234.56" (US) — decide pelo ultimo
// separador decimal (o mais a direita), igual planilhas de banco
// costumam exportar de jeitos diferentes.
function parseCurrencyFlexible(value) {
	const raw = cleanText(value).replace(/[^\d,.-]/g, "");
	if (!raw) return 0;
	const lastComma = raw.lastIndexOf(",");
	const lastDot = raw.lastIndexOf(".");
	let normalized = raw;
	if (lastComma > lastDot) {
		normalized = raw.replace(/\./g, "").replace(",", ".");
	} else if (lastDot > lastComma) {
		normalized = raw.replace(/,/g, "");
	}
	const num = Number(normalized);
	return Number.isFinite(num) ? num : 0;
}

// Aceita "DD/MM/AAAA", "AAAA-MM-DD" ou serial do Excel (numero de dias
// desde 1899-12-30) — planilha de extrato bancario as vezes vem com
// datas ja formatadas como texto, as vezes com o numero de serie cru.
function parseDateFlexible(value) {
	const raw = cleanText(value);
	if (!raw) return null;
	const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
	if (brMatch) {
		const [, day, month, yearRaw] = brMatch;
		const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
		return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
	}
	if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
	const serial = Number(raw);
	if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		const date = new Date(excelEpoch.getTime() + serial * 86400000);
		return date.toISOString().slice(0, 10);
	}
	return null;
}

async function upsertExtratoBancario(records) {
	let created = 0;
	let ignorados = 0;
	for (const record of records) {
		const data = parseDateFlexible(record.data);
		const valor = parseCurrencyFlexible(record.valor);
		if (!data || !valor) {
			ignorados += 1;
			continue;
		}
		await db.query(
			`insert into finan_extrato_bancario (id, data, descricao, valor) values ($1, $2, $3, $4)`,
			[randomId("extrato"), data, record.descricao || "Sem descrição", valor],
		);
		created += 1;
	}
	return { created, updated: 0, total: records.length, ignorados };
}

const UPSERT_HANDLERS = {
	fornecedores: upsertFornecedores,
	extrato_bancario: upsertExtratoBancario,
};

async function applyTemplateToRows(rows, template, { createdBy } = {}) {
	const records = applyMapping(rows, template.mapeamento, template.entidadeAlvo);
	const { valid, invalid } = validateMappedRecords(records, template.entidadeAlvo);
	const handler = UPSERT_HANDLERS[template.entidadeAlvo];
	if (!handler) throw new Error(`Entidade-alvo "${template.entidadeAlvo}" não suportada.`);
	const result = await handler(valid, { createdBy });
	return { ...result, invalidos: invalid.length, amostraInvalidos: invalid.slice(0, 5) };
}

module.exports = {
	TARGET_FIELDS,
	getTargetFields,
	parseWorkbookBuffer,
	applyMapping,
	validateMappedRecords,
	applyTemplateToRows,
	__testables: { parseCurrencyFlexible, parseDateFlexible },
};
