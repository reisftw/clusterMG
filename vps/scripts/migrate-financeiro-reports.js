const crypto = require("node:crypto");
const db = require("../api/src/db");

const APPLY = process.argv.includes("--apply");
const JSON_MODE = process.argv.includes("--json");

const REPORTS_COLLECTION = "financeiro_reports";
const LOGS_COLLECTION = "financeiro_import_logs";
const SERASA_PATH = "financeiro_reports/serasa";
const TARIFAS_PATH = "financeiro_reports/tarifas";

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function hash(value) {
	return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function idFor(prefix, payload) {
	return `${prefix}_${hash(payload).slice(0, 24)}`;
}

function text(value) {
	return String(value ?? "").trim();
}

function number(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = text(value)
		.replace(/[R$\s]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	const parsed = Number(normalized || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function int(value) {
	return Math.trunc(number(value));
}

function dateOnly(value) {
	const raw = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function timestamp(value, fallback = new Date().toISOString()) {
	const raw = text(value);
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function sourceHash(kind, legacyPath, item) {
	return hash({ kind, legacyPath, item });
}

async function readDocument(path) {
	const result = await db.query(
		`select path, collection_path as "collectionPath", document_id as "documentId",
		        data, updated_at as "updatedAt"
		   from app_documents
		  where path = $1`,
		[path],
	);
	return result.rows[0] || null;
}

async function readLogs() {
	const result = await db.query(
		`select path, collection_path as "collectionPath", document_id as "documentId",
		        data, updated_at as "updatedAt"
		   from app_documents
		  where collection_path = $1
		  order by document_id`,
		[LOGS_COLLECTION],
	);
	return result.rows;
}

function normalizeSerasa(doc) {
	const data = doc?.data || {};
	const now = timestamp(doc?.updatedAt);
	const rows = (data.rows || [])
		.filter((item) => item && typeof item === "object")
		.map((item) => {
			const payload = { ...item };
			const contentHash = sourceHash("serasa_movimentacao", doc.path, payload);
			return {
				id: text(item.id) || idFor("serasa", { doc: doc.path, item }),
				data: dateOnly(item.date || item.data),
				ano: int(item.year || item.ano),
				mes: int(item.month || item.mes || item.numMes),
				tipo: text(item.type || item.tipo),
				operacao: text(item.operation || item.operacao),
				descricao: text(item.description || item.descricao),
				valor: number(item.value || item.valor),
				direction: text(item.direction),
				is_net_revenue: Boolean(item.isNetRevenue || item.is_net_revenue),
				source_hash: contentHash,
				legacy_path: doc.path,
				legacy_document_id: doc.documentId,
				created_at: now,
				updated_at: now,
				source_payload: payload,
			};
		});
	const clientes = (data.clientesHistory || [])
		.filter((item) => item && Number(item.year || item.ano) && Number(item.month || item.mes))
		.map((item) => ({
			ano: int(item.year || item.ano),
			mes: int(item.month || item.mes),
			clientes: int(item.clientes || item.clients || item.quantidade),
			legacy_path: doc.path,
			legacy_document_id: doc.documentId,
			created_at: timestamp(item.updatedAt, now),
			updated_at: timestamp(item.updatedAt, now),
			source_payload: { ...item },
		}));
	return { rows, clientes };
}

function normalizeTariffPeriodItem(doc, kind, item, mapper) {
	const mapped = mapper(item);
	const contentHash = sourceHash(kind, doc.path, item);
	return {
		id: text(item.id) || idFor(kind, { doc: doc.path, item }),
		...mapped,
		source_hash: contentHash,
		legacy_path: doc.path,
		legacy_document_id: doc.documentId,
		created_at: timestamp(doc.updatedAt),
		updated_at: timestamp(doc.updatedAt),
		source_payload: { ...item },
	};
}

function normalizeTarifas(doc) {
	const data = doc?.data || {};
	const faturas = (data.faturas || []).map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_faturas", item, (source) => ({
			ano: int(source.year || source.ano),
			mes: int(source.month || source.mes),
			metric: text(source.metric || source.tipo),
			quantidade: number(source.value || source.quantidade),
		})),
	);
	const formasPagamento = new Map();
	for (const item of data.formasPagamentoQuantidade || []) {
		const key = `${int(item.year || item.ano)}:${int(item.month || item.mes)}:${text(item.method || item.forma)}`;
		formasPagamento.set(key, {
			year: int(item.year || item.ano),
			month: int(item.month || item.mes),
			method: text(item.method || item.forma),
			quantity: number(item.quantity || item.quantidade),
			percent: number(item.percent),
			quantityPayload: item,
		});
	}
	for (const item of data.formasPagamentoValor || []) {
		const key = `${int(item.year || item.ano)}:${int(item.month || item.mes)}:${text(item.method || item.forma)}`;
		const previous = formasPagamento.get(key) || {
			year: int(item.year || item.ano),
			month: int(item.month || item.mes),
			method: text(item.method || item.forma),
		};
		formasPagamento.set(key, {
			...previous,
			value: number(item.value || item.valor),
			percent: number(item.percent || previous.percent),
			valuePayload: item,
		});
	}
	const pagamento = [...formasPagamento.values()].map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_formas_pagamento", item, () => ({
			ano: item.year,
			mes: item.month,
			forma: item.method,
			quantidade: number(item.quantity),
			valor: number(item.value),
			percent: number(item.percent),
		})),
	);
	const receitaCliente = (data.receitaPorCliente || []).map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_receita_cliente", item, (source) => ({
			ano: int(source.year || source.ano),
			mes: int(source.month || source.mes),
			cliente_codigo: text(source.clientCode || source.clienteCodigo || source.codigo),
			cliente_nome: text(source.clientName || source.clienteNome || source.cliente),
			forma_cobranca: text(source.method || source.formaCobranca || source.forma_cobranca),
			valor: number(source.value || source.valor),
			quantidade: number(source.quantity || source.quantidade || 1),
		})),
	);
	const mensais = (data.tarifasMensais || []).map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_mensais", item, (source) => ({
			ano: int(source.year || source.ano),
			mes: int(source.month || source.mes),
			banco: text(source.bank || source.banco || source.label),
			valor: number(source.value || source.valor),
		})),
	);
	const cobrancaClientes = (data.formasCobrancaClientes || []).map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_cobranca_clientes", item, (source) => ({
			ano: int(source.year || source.ano),
			mes: int(source.month || source.mes),
			forma_cobranca: text(source.method || source.formaCobranca || source.forma_cobranca),
			clientes: number(source.customers || source.clientes || source.quantidade),
			valor_aproximado: number(source.estimatedValue || source.valorAproximado || source.valor_aproximado),
		})),
	);
	const boletos = (data.tarifasBoletos || []).map((item) =>
		normalizeTariffPeriodItem(doc, "tarifas_boletos", item, (source) => ({
			tarifa: text(source.name || source.tarifa || source.label),
			valor: number(source.value || source.valor),
			formas_pagamento: text(source.paymentMethods || source.formasPagamento || source.formas_pagamento),
		})),
	);
	return { faturas, pagamento, receitaCliente, mensais, cobrancaClientes, boletos };
}

function normalizeLogs(logs = []) {
	return logs.map((record) => {
		const data = record.data || {};
		return {
			id: record.documentId,
			source_id: text(data.sourceId),
			label: text(data.label),
			status: text(data.status),
			message: text(data.message),
			imported_rows: int(data.importedRows),
			payload: data,
			legacy_path: record.path,
			legacy_document_id: record.documentId,
			created_at: timestamp(data.createdAt || record.updatedAt),
			updated_at: timestamp(record.updatedAt),
			source_payload: data,
		};
	});
}

function normalizeMeta(doc, reportId) {
	const data = doc?.data || {};
	return {
		report_id: reportId,
		import_info: data.importInfo || {},
		summary: data.summary || {},
		blocos_detectados: data.blocosDetectados || [],
		blocos_nao_mapeados: data.blocosNaoMapeados || [],
		legacy_path: doc?.path || `financeiro_reports/${reportId}`,
		legacy_document_id: doc?.documentId || reportId,
		created_at: timestamp(doc?.updatedAt),
		updated_at: timestamp(doc?.updatedAt),
		source_payload: data,
	};
}

async function upsertMany(client, table, rows, conflictTarget) {
	if (!rows.length) return 0;
	const columns = Object.keys(rows[0]);
	const placeholders = rows.map(
		(_, rowIndex) =>
			`(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`,
	);
	const updates = columns
		.filter((column) => !conflictTarget.includes(column) && column !== "created_at")
		.map((column) => `${column} = excluded.${column}`)
		.join(", ");
	const values = rows.flatMap((row) =>
		columns.map((column) => {
			const value = row[column];
			return value && typeof value === "object" ? JSON.stringify(value) : value;
		}),
	);
	await client.query(
		`insert into ${table} (${columns.join(", ")})
		 values ${placeholders.join(", ")}
		 on conflict (${conflictTarget.join(", ")}) do update set ${updates}`,
		values,
	);
	return rows.length;
}

async function tableStats(client) {
	const tables = [
		"financeiro_serasa_movimentacoes",
		"financeiro_serasa_clientes_base",
		"financeiro_tarifas_faturas",
		"financeiro_tarifas_formas_pagamento",
		"financeiro_tarifas_receita_cliente",
		"financeiro_tarifas_mensais",
		"financeiro_tarifas_cobranca_clientes",
		"financeiro_tarifas_boletos",
		"financeiro_import_logs",
		"financeiro_reports_meta",
	];
	const stats = {};
	for (const table of tables) {
		const result = await client.query(`select count(*)::int as total from ${table}`);
		stats[table] = result.rows[0].total;
	}
	return stats;
}

function sumByMonth(rows, field) {
	const output = {};
	for (const row of rows) {
		const key = `${row.ano}-${String(row.mes).padStart(2, "0")}`;
		output[key] = Number(((output[key] || 0) + number(row[field])).toFixed(2));
	}
	return output;
}

async function run() {
	const client = await db.connect();
	try {
		const serasaDoc = await readDocument(SERASA_PATH);
		const tarifasDoc = await readDocument(TARIFAS_PATH);
		const logs = await readLogs();
		const serasa = normalizeSerasa(serasaDoc);
		const tarifas = normalizeTarifas(tarifasDoc);
		const importLogs = normalizeLogs(logs);
		const normalized = {
			serasaMovimentacoes: serasa.rows,
			serasaClientesBase: serasa.clientes,
			tarifasFaturas: tarifas.faturas,
			tarifasFormasPagamento: tarifas.pagamento,
			tarifasReceitaCliente: tarifas.receitaCliente,
			tarifasMensais: tarifas.mensais,
			tarifasCobrancaClientes: tarifas.cobrancaClientes,
			tarifasBoletos: tarifas.boletos,
			importLogs,
			meta: [normalizeMeta(serasaDoc, "serasa"), normalizeMeta(tarifasDoc, "tarifas")],
		};
		const beforeStats = await tableStats(client);
		const report = {
			apply: APPLY,
			sourceCounts: {
				serasaRows: serasaDoc?.data?.rows?.length || 0,
				serasaClientesHistory: serasaDoc?.data?.clientesHistory?.length || 0,
				tarifasFaturas: tarifasDoc?.data?.faturas?.length || 0,
				tarifasFormasPagamentoQuantidade: tarifasDoc?.data?.formasPagamentoQuantidade?.length || 0,
				tarifasFormasPagamentoValor: tarifasDoc?.data?.formasPagamentoValor?.length || 0,
				tarifasReceitaCliente: tarifasDoc?.data?.receitaPorCliente?.length || 0,
				tarifasMensais: tarifasDoc?.data?.tarifasMensais?.length || 0,
				tarifasCobrancaClientes: tarifasDoc?.data?.formasCobrancaClientes?.length || 0,
				tarifasBoletos: tarifasDoc?.data?.tarifasBoletos?.length || 0,
				importLogs: logs.length,
			},
			normalizedCounts: Object.fromEntries(
				Object.entries(normalized).map(([key, rows]) => [key, rows.length]),
			),
			validation: {
				serasaValorPorMes: sumByMonth(normalized.serasaMovimentacoes, "valor"),
				tarifasFaturasPorMes: sumByMonth(normalized.tarifasFaturas, "quantidade"),
				tarifasPagamentoValorPorMes: sumByMonth(normalized.tarifasFormasPagamento, "valor"),
				tarifasReceitaClientePorMes: sumByMonth(normalized.tarifasReceitaCliente, "valor"),
			},
			beforeStats,
		};
		if (APPLY) {
			await client.query("begin");
			await upsertMany(client, "financeiro_serasa_movimentacoes", normalized.serasaMovimentacoes, ["source_hash"]);
			await upsertMany(client, "financeiro_serasa_clientes_base", normalized.serasaClientesBase, ["ano", "mes"]);
			await upsertMany(client, "financeiro_tarifas_faturas", normalized.tarifasFaturas, ["source_hash"]);
			await upsertMany(client, "financeiro_tarifas_formas_pagamento", normalized.tarifasFormasPagamento, ["source_hash"]);
			await upsertMany(client, "financeiro_tarifas_receita_cliente", normalized.tarifasReceitaCliente, ["source_hash"]);
			await upsertMany(client, "financeiro_tarifas_mensais", normalized.tarifasMensais, ["source_hash"]);
			await upsertMany(client, "financeiro_tarifas_cobranca_clientes", normalized.tarifasCobrancaClientes, ["source_hash"]);
			await upsertMany(client, "financeiro_tarifas_boletos", normalized.tarifasBoletos, ["source_hash"]);
			await upsertMany(client, "financeiro_import_logs", normalized.importLogs, ["id"]);
			await upsertMany(client, "financeiro_reports_meta", normalized.meta, ["report_id"]);
			await client.query("commit");
			report.afterStats = await tableStats(client);
		}
		if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
		else console.dir(report, { depth: null });
	} catch (error) {
		try {
			await client.query("rollback");
		} catch {
			// ignore rollback failure
		}
		throw error;
	} finally {
		client.release();
	}
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
