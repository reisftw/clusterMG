const crypto = require("node:crypto");
const db = require("./db");

const SERASA_REPORT_ID = "serasa";
const TARIFAS_REPORT_ID = "tarifas";
const DRE_LINE_IDS = new Set([
	"receita_bruta",
	"deducoes_abatimentos",
	"cpv_cmv",
	"despesas_vendas",
	"despesas_administrativas",
	"despesas_financeiras",
	"provisoes_irpj_csll",
]);

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		// Comparador explicito por code unit (nao localeCompare): o hash
		// precisa ser deterministico entre maquinas/locales diferentes, e
		// localeCompare pode variar por ICU/locale do ambiente de execucao.
		return `{${Object.keys(value)
			.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function hash(value) {
	return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function sourceHash(kind, legacyPath, item) {
	return hash({ kind, legacyPath, item });
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

function integer(value) {
	return Math.trunc(number(value));
}

function timestamp(value, fallback = new Date().toISOString()) {
	const raw = text(value);
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function dateOnly(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	const raw = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime())
		? parsed.toISOString().slice(0, 10)
		: "";
}

function monthName(month) {
	return (
		[
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
		][Number(month) || 0] || ""
	);
}

function sqlJson(value) {
	return JSON.stringify(value ?? null);
}

const MAX_UPSERT_PARAMS = 10000;

async function upsertMany(client, table, rows, conflictTarget) {
	if (!rows.length) return 0;
	const columns = Object.keys(rows[0]);
	const rowsPerBatch = Math.max(1, Math.floor(MAX_UPSERT_PARAMS / columns.length));
	const updates = columns
		.filter((column) => !conflictTarget.includes(column) && column !== "created_at")
		.map((column) => `${column} = excluded.${column}`)
		.join(", ");
	for (let index = 0; index < rows.length; index += rowsPerBatch) {
		const batch = rows.slice(index, index + rowsPerBatch);
		const placeholders = batch.map(
			(_, rowIndex) =>
				`(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`,
		);
		const values = batch.flatMap((row) =>
			columns.map((column) =>
				row[column] && typeof row[column] === "object"
					? sqlJson(row[column])
					: row[column],
			),
		);
		await client.query(
			`insert into ${table} (${columns.join(", ")})
			 values ${placeholders.join(", ")}
			 on conflict (${conflictTarget.join(", ")}) do update set ${updates}`,
			values,
		);
	}
	return rows.length;
}

async function saveMeta(client, reportId, data = {}) {
	await client.query(
		`insert into financeiro_reports_meta (
			report_id, import_info, summary, blocos_detectados, blocos_nao_mapeados,
			legacy_path, legacy_document_id, source_payload
		)
		values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb)
		on conflict (report_id) do update set
			import_info = excluded.import_info,
			summary = excluded.summary,
			blocos_detectados = excluded.blocos_detectados,
			blocos_nao_mapeados = excluded.blocos_nao_mapeados,
			legacy_path = excluded.legacy_path,
			legacy_document_id = excluded.legacy_document_id,
			source_payload = excluded.source_payload`,
		[
			reportId,
			sqlJson(data.importInfo || {}),
			sqlJson(data.summary || {}),
			sqlJson(data.blocosDetectados || []),
			sqlJson(data.blocosNaoMapeados || []),
			`financeiro_reports/${reportId}`,
			reportId,
			sqlJson(data),
		],
	);
}

async function getMeta(reportId) {
	const result = await db.query(
		`select import_info, summary, blocos_detectados, blocos_nao_mapeados, source_payload
		   from financeiro_reports_meta
		  where report_id = $1`,
		[reportId],
	);
	const row = result.rows[0] || {};
	return {
		importInfo: row.import_info || {},
		summary: row.summary || {},
		blocosDetectados: row.blocos_detectados || [],
		blocosNaoMapeados: row.blocos_nao_mapeados || [],
		sourcePayload: row.source_payload || {},
	};
}

function normalizeSerasaMovement(item = {}) {
	const legacyPath = "financeiro_reports/serasa";
	const payload = { ...item };
	return {
		id: text(item.id) || idFor("serasa", payload),
		data: text(item.date || item.data) || null,
		ano: integer(item.year || item.ano),
		mes: integer(item.month || item.mes || item.numMes),
		tipo: text(item.type || item.tipo),
		operacao: text(item.operation || item.operacao),
		descricao: text(item.description || item.descricao),
		valor: number(item.value || item.valor),
		direction: text(item.direction),
		is_net_revenue: Boolean(item.isNetRevenue || item.is_net_revenue),
		source_hash: sourceHash("serasa_movimentacao", legacyPath, payload),
		legacy_path: legacyPath,
		legacy_document_id: SERASA_REPORT_ID,
		source_payload: payload,
	};
}

function mapSerasaMovement(row = {}) {
	return {
		...(row.source_payload || {}),
		id: row.id,
		date: dateOnly(row.data) || row.source_payload?.date || "",
		type: row.tipo || "",
		year: Number(row.ano || 0),
		month: Number(row.mes || 0),
		value: Number(row.valor || 0),
		direction: row.direction || "",
		monthName: row.source_payload?.monthName || monthName(row.mes),
		operation: row.operacao || "",
		description: row.descricao || "",
		isNetRevenue: Boolean(row.is_net_revenue),
		isClientMarker: Boolean(row.source_payload?.isClientMarker),
	};
}

function normalizeSerasaClientBase(item = {}) {
	return {
		ano: integer(item.year || item.ano),
		mes: integer(item.month || item.mes),
		clientes: integer(item.clientes || item.clients || item.quantidade),
		legacy_path: "financeiro_reports/serasa",
		legacy_document_id: SERASA_REPORT_ID,
		source_payload: { ...item },
	};
}

function mapSerasaClientBase(row = {}) {
	return {
		...(row.source_payload || {}),
		key:
			row.source_payload?.key ||
			`${row.ano}-${String(row.mes).padStart(2, "0")}`,
		year: Number(row.ano || 0),
		month: Number(row.mes || 0),
		label: row.source_payload?.label || `${monthName(row.mes)} ${row.ano}`,
		clientes: Number(row.clientes || 0),
		updatedAt: timestamp(row.updated_at),
	};
}

async function saveSerasaReport(data = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from financeiro_serasa_movimentacoes");
		await client.query("delete from financeiro_serasa_clientes_base");
		await upsertMany(
			client,
			"financeiro_serasa_movimentacoes",
			(data.rows || []).map(normalizeSerasaMovement),
			["source_hash"],
		);
		await upsertMany(
			client,
			"financeiro_serasa_clientes_base",
			(data.clientesHistory || []).map(normalizeSerasaClientBase),
			["ano", "mes"],
		);
		await saveMeta(client, SERASA_REPORT_ID, data);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

async function getSerasaReport() {
	const [movements, clients, meta] = await Promise.all([
		db.query(
			`select * from financeiro_serasa_movimentacoes
			  order by data desc nulls last, id`,
		),
		db.query(
			`select * from financeiro_serasa_clientes_base
			  order by ano, mes`,
		),
		getMeta(SERASA_REPORT_ID),
	]);
	return {
		rows: movements.rows.map(mapSerasaMovement),
		clientesHistory: clients.rows.map(mapSerasaClientBase),
		clientes: clients.rows.at(-1)?.clientes || 0,
		daily: meta.sourcePayload?.daily || [],
		monthly: meta.sourcePayload?.monthly || [],
		summary: meta.summary || {},
		importInfo: meta.importInfo || {},
	};
}

async function clearSerasaReport(data = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from financeiro_serasa_movimentacoes");
		await client.query("delete from financeiro_serasa_clientes_base");
		await saveMeta(client, SERASA_REPORT_ID, data);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

function normalizeTariffPeriodItem(kind, item = {}, mapper = () => ({})) {
	const legacyPath = "financeiro_reports/tarifas";
	const payload = { ...item };
	return {
		id: text(item.id) || idFor(kind, payload),
		...mapper(item),
		source_hash: sourceHash(kind, legacyPath, payload),
		legacy_path: legacyPath,
		legacy_document_id: TARIFAS_REPORT_ID,
		source_payload: payload,
	};
}

function normalizePaymentRows(data = {}) {
	const rows = new Map();
	for (const item of data.formasPagamentoQuantidade || []) {
		const key = `${integer(item.year || item.ano)}:${integer(item.month || item.mes)}:${text(item.method || item.forma)}`;
		rows.set(key, {
			year: integer(item.year || item.ano),
			month: integer(item.month || item.mes),
			method: text(item.method || item.forma),
			quantity: number(item.quantity || item.quantidade),
			percent: number(item.percent),
			quantityPayload: item,
		});
	}
	for (const item of data.formasPagamentoValor || []) {
		const key = `${integer(item.year || item.ano)}:${integer(item.month || item.mes)}:${text(item.method || item.forma)}`;
		const previous = rows.get(key) || {
			year: integer(item.year || item.ano),
			month: integer(item.month || item.mes),
			method: text(item.method || item.forma),
		};
		rows.set(key, {
			...previous,
			value: number(item.value || item.valor),
			percent: number(item.percent || previous.percent),
			valuePayload: item,
		});
	}
	return [...rows.values()].map((item) =>
		normalizeTariffPeriodItem("tarifas_formas_pagamento", item, () => ({
			ano: item.year,
			mes: item.month,
			forma: item.method,
			quantidade: number(item.quantity),
			valor: number(item.value),
			percent: number(item.percent),
		})),
	);
}

function normalizeTariffs(data = {}) {
	return {
		faturas: (data.faturas || []).map((item) =>
			normalizeTariffPeriodItem("tarifas_faturas", item, (source) => ({
				ano: integer(source.year || source.ano),
				mes: integer(source.month || source.mes),
				metric: text(source.metric || source.tipo),
				quantidade: number(source.value || source.quantidade),
			})),
		),
		pagamento: normalizePaymentRows(data),
		receitaCliente: (data.receitaPorCliente || []).map((item) =>
			normalizeTariffPeriodItem("tarifas_receita_cliente", item, (source) => ({
				ano: integer(source.year || source.ano),
				mes: integer(source.month || source.mes),
				cliente_codigo: text(source.clientCode || source.clienteCodigo || source.codigo),
				cliente_nome: text(source.clientName || source.clienteNome || source.cliente),
				forma_cobranca: text(source.method || source.formaCobranca || source.forma_cobranca),
				valor: number(source.value || source.valor),
				quantidade: number(source.quantity || source.quantidade || 1),
			})),
		),
		mensais: (data.tarifasMensais || []).map((item) =>
			normalizeTariffPeriodItem("tarifas_mensais", item, (source) => ({
				ano: integer(source.year || source.ano),
				mes: integer(source.month || source.mes),
				banco: text(source.bank || source.banco || source.label),
				valor: number(source.value || source.valor),
			})),
		),
		cobrancaClientes: (data.formasCobrancaClientes || []).map((item) =>
			normalizeTariffPeriodItem("tarifas_cobranca_clientes", item, (source) => ({
				ano: integer(source.year || source.ano),
				mes: integer(source.month || source.mes),
				forma_cobranca: text(source.method || source.formaCobranca || source.forma_cobranca),
				clientes: number(source.customers || source.clientes || source.quantidade),
				valor_aproximado: number(source.estimatedValue || source.valorAproximado || source.valor_aproximado),
			})),
		),
		boletos: (data.tarifasBoletos || []).map((item) =>
			normalizeTariffPeriodItem("tarifas_boletos", item, (source) => ({
				tarifa: text(source.name || source.tarifa || source.label),
				valor: number(source.value || source.valor),
				formas_pagamento: text(source.paymentMethods || source.formasPagamento || source.formas_pagamento),
			})),
		),
	};
}

async function saveTariffsReport(data = {}) {
	const normalized = normalizeTariffs(data);
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from financeiro_tarifas_faturas");
		await client.query("delete from financeiro_tarifas_formas_pagamento");
		await client.query("delete from financeiro_tarifas_receita_cliente");
		await client.query("delete from financeiro_tarifas_mensais");
		await client.query("delete from financeiro_tarifas_cobranca_clientes");
		await client.query("delete from financeiro_tarifas_boletos");
		await upsertMany(client, "financeiro_tarifas_faturas", normalized.faturas, ["source_hash"]);
		await upsertMany(client, "financeiro_tarifas_formas_pagamento", normalized.pagamento, ["source_hash"]);
		await upsertMany(client, "financeiro_tarifas_receita_cliente", normalized.receitaCliente, ["source_hash"]);
		await upsertMany(client, "financeiro_tarifas_mensais", normalized.mensais, ["source_hash"]);
		await upsertMany(client, "financeiro_tarifas_cobranca_clientes", normalized.cobrancaClientes, ["source_hash"]);
		await upsertMany(client, "financeiro_tarifas_boletos", normalized.boletos, ["source_hash"]);
		await saveMeta(client, TARIFAS_REPORT_ID, data);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

function payloadWith(source, extra = {}) {
	return { ...(source.source_payload || {}), ...extra };
}

async function getTariffsReport() {
	const [faturas, pagamento, receitaCliente, mensais, cobrancaClientes, boletos, meta] =
		await Promise.all([
			db.query("select * from financeiro_tarifas_faturas order by ano, mes, metric"),
			db.query("select * from financeiro_tarifas_formas_pagamento order by ano, mes, forma"),
			db.query("select * from financeiro_tarifas_receita_cliente order by ano, mes, cliente_nome"),
			db.query("select * from financeiro_tarifas_mensais order by ano, mes, banco"),
			db.query("select * from financeiro_tarifas_cobranca_clientes order by ano, mes, forma_cobranca"),
			db.query("select * from financeiro_tarifas_boletos order by tarifa"),
			getMeta(TARIFAS_REPORT_ID),
		]);
	const formasPagamentoQuantidade = pagamento.rows.map((row) =>
		payloadWith(row, {
			id: row.id,
			year: Number(row.ano),
			month: Number(row.mes),
			method: row.forma,
			quantity: Number(row.quantidade || 0),
			percent: Number(row.percent || 0),
			monthName: monthName(row.mes),
		}),
	);
	const formasPagamentoValor = pagamento.rows.map((row) =>
		payloadWith(row, {
			id: row.id,
			year: Number(row.ano),
			month: Number(row.mes),
			method: row.forma,
			value: Number(row.valor || 0),
			percent: Number(row.percent || 0),
			monthName: monthName(row.mes),
		}),
	);
	return {
		receitasDiarias: meta.sourcePayload?.receitasDiarias || [],
		tarifasMensais: mensais.rows.map((row) =>
			payloadWith(row, {
				id: row.id,
				year: Number(row.ano),
				month: Number(row.mes),
				bank: row.banco || "",
				value: Number(row.valor || 0),
				monthName: monthName(row.mes),
			}),
		),
		formasCobrancaClientes: cobrancaClientes.rows.map((row) =>
			payloadWith(row, {
				id: row.id,
				year: Number(row.ano),
				month: Number(row.mes),
				method: row.forma_cobranca || "",
				customers: Number(row.clientes || 0),
				estimatedValue: Number(row.valor_aproximado || 0),
				monthName: monthName(row.mes),
			}),
		),
		tarifasBoletos: boletos.rows.map((row) =>
			payloadWith(row, {
				id: row.id,
				name: row.tarifa || "",
				value: Number(row.valor || 0),
				paymentMethods: row.formas_pagamento || "",
			}),
		),
		formasPagamentoQuantidade,
		formasPagamentoValor,
		formasCobrancaValor: meta.sourcePayload?.formasCobrancaValor || [],
		faturas: faturas.rows.map((row) =>
			payloadWith(row, {
				id: row.id,
				year: Number(row.ano),
				month: Number(row.mes),
				metric: row.metric || "",
				value: Number(row.quantidade || 0),
				monthName: monthName(row.mes),
			}),
		),
		receitaPorCliente: receitaCliente.rows.map((row) =>
			payloadWith(row, {
				id: row.id,
				year: Number(row.ano),
				month: Number(row.mes),
				clientCode: row.cliente_codigo || "",
				clientName: row.cliente_nome || "",
				method: row.forma_cobranca || "",
				value: Number(row.valor || 0),
				quantity: Number(row.quantidade || 0),
				monthName: monthName(row.mes),
			}),
		),
		blocosDetectados: meta.blocosDetectados || [],
		blocosNaoMapeados: meta.blocosNaoMapeados || [],
		summary: meta.summary || {},
		importInfo: meta.importInfo || {},
	};
}

async function clearTariffsReport(data = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from financeiro_tarifas_faturas");
		await client.query("delete from financeiro_tarifas_formas_pagamento");
		await client.query("delete from financeiro_tarifas_receita_cliente");
		await client.query("delete from financeiro_tarifas_mensais");
		await client.query("delete from financeiro_tarifas_cobranca_clientes");
		await client.query("delete from financeiro_tarifas_boletos");
		await saveMeta(client, TARIFAS_REPORT_ID, data);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

async function appendImportLog(data = {}) {
	const id = `fin_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
	await db.query(
		`insert into financeiro_import_logs (
			id, source_id, label, status, message, imported_rows, payload,
			legacy_path, legacy_document_id, source_payload, created_at
		)
		values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11)`,
		[
			id,
			text(data.sourceId),
			text(data.label),
			text(data.status),
			text(data.message),
			integer(data.importedRows),
			sqlJson(data),
			`financeiro_import_logs/${id}`,
			id,
			sqlJson(data),
			timestamp(data.createdAt),
		],
	);
	return id;
}

async function listImportLogs(limit = 20) {
	const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
	const result = await db.query(
		`select * from financeiro_import_logs order by created_at desc limit $1`,
		[safeLimit],
	);
	return result.rows.map((row) => ({
		path: row.legacy_path || `financeiro_import_logs/${row.id}`,
		collectionPath: "financeiro_import_logs",
		documentId: row.legacy_document_id || row.id,
		parentPath: null,
		data: row.source_payload || row.payload || {},
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at,
	}));
}

function normalizeDreLancamento(item = {}, index = 0, context = {}) {
	const lineId = text(item.linhaDre || item.linha_dre || item.lineId);
	if (!DRE_LINE_IDS.has(lineId)) return null;
	const ano = integer(item.competenciaAno || item.competencia_ano || item.ano);
	const mes = integer(item.competenciaMes || item.competencia_mes || item.mes);
	if (ano < 2000 || mes < 1 || mes > 12) return null;
	const payload = {
		...item,
		competenciaAno: ano,
		competenciaMes: mes,
		linhaDre: lineId,
	};
	return {
		id:
			text(item.id) ||
			idFor("dre", {
				context,
				index,
				payload,
			}),
		competencia_mes: mes,
		competencia_ano: ano,
		linha_dre: lineId,
		categoria_original: text(item.categoriaOriginal || item.categoria_original),
		descricao: text(item.descricao || item.description),
		valor: number(item.valor || item.value),
		origem_arquivo: text(item.origemArquivo || item.origem_arquivo || context.fileName),
		is_fake: Boolean(item.isFake ?? item.is_fake ?? context.isFake),
		criado_por: text(context.createdBy || item.criadoPor || item.criado_por),
		source_payload: payload,
	};
}

async function listDreLancamentos({ ano, mes, isFake = false } = {}) {
	const params = [Boolean(isFake)];
	const conditions = ["is_fake = $1"];
	if (ano) {
		params.push(integer(ano));
		conditions.push(`competencia_ano = $${params.length}`);
	}
	if (mes) {
		params.push(integer(mes));
		conditions.push(`competencia_mes = $${params.length}`);
	}
	const result = await db.query(
		`select competencia_ano, competencia_mes, linha_dre,
		        coalesce(sum(valor), 0) as total,
		        count(*)::int as quantidade,
		        max(criado_em) as atualizado_em
		   from dre_lancamentos
		  where ${conditions.join(" and ")}
		  group by competencia_ano, competencia_mes, linha_dre
		  order by competencia_ano desc, competencia_mes desc, linha_dre`,
		params,
	);
	const detailResult = await db.query(
		`select id, competencia_ano, competencia_mes, linha_dre, categoria_original,
		        descricao, valor, origem_arquivo, is_fake, criado_em, criado_por
		   from dre_lancamentos
		  where ${conditions.join(" and ")}
		  order by competencia_ano desc, competencia_mes desc, linha_dre, categoria_original, id
		  limit 500`,
		params,
	);
	const periods = new Map();
	const totalsByLine = {};
	for (const row of result.rows) {
		const key = `${row.competencia_ano}-${String(row.competencia_mes).padStart(2, "0")}`;
		periods.set(key, {
			ano: Number(row.competencia_ano),
			mes: Number(row.competencia_mes),
			key,
		});
		if (
			(!ano || Number(row.competencia_ano) === Number(ano)) &&
			(!mes || Number(row.competencia_mes) === Number(mes))
		) {
			totalsByLine[row.linha_dre] =
				Number(totalsByLine[row.linha_dre] || 0) + number(row.total);
		}
	}
	return {
		ok: true,
		isFake: Boolean(isFake),
		competencias: Array.from(periods.values()),
		totalsByLine,
		rows: detailResult.rows.map((row) => ({
			id: row.id,
			competenciaAno: Number(row.competencia_ano),
			competenciaMes: Number(row.competencia_mes),
			linhaDre: row.linha_dre,
			categoriaOriginal: row.categoria_original,
			descricao: row.descricao,
			valor: number(row.valor),
			origemArquivo: row.origem_arquivo,
			isFake: row.is_fake,
			criadoEm: row.criado_em,
			criadoPor: row.criado_por,
		})),
	};
}

async function replaceDreLancamentos(data = {}, user = {}) {
	const context = {
		fileName: text(data.fileName),
		isFake: Boolean(data.isFake),
		createdBy: text(user.uid || user.email || data.createdBy),
		importedAt: new Date().toISOString(),
	};
	const rows = (Array.isArray(data.rows) ? data.rows : [])
		.map((row, index) => normalizeDreLancamento(row, index, context))
		.filter(Boolean);
	if (!rows.length) {
		throw new Error("Nenhum lançamento DRE válido foi informado.");
	}
	const periods = Array.from(
		new Map(
			rows.map((row) => [
				`${row.competencia_ano}-${row.competencia_mes}`,
				{
					ano: row.competencia_ano,
					mes: row.competencia_mes,
					isFake: row.is_fake,
				},
			]),
		).values(),
	);
	const client = await db.connect();
	try {
		await client.query("begin");
		for (const period of periods) {
			await client.query(
				`delete from dre_lancamentos
				  where competencia_ano = $1
				    and competencia_mes = $2
				    and is_fake = $3`,
				[period.ano, period.mes, period.isFake],
			);
		}
		await upsertMany(client, "dre_lancamentos", rows, ["id"]);
		await appendImportLog({
			sourceId: "dre",
			label: "DRE",
			status: "ok",
			message: context.isFake
				? "Dados fictícios de DRE criados."
				: "DRE importada.",
			importedRows: rows.length,
			fileName: context.fileName,
			isFake: context.isFake,
		});
		await client.query("commit");
		return { ok: true, importedRows: rows.length, periods };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function createFakeDreLancamentos(user = {}) {
	const now = new Date();
	const rows = [];
	for (let index = 5; index >= 0; index -= 1) {
		const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
		const ano = date.getFullYear();
		const mes = date.getMonth() + 1;
		const base = 920000 + (5 - index) * 38500;
		rows.push(
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "receita_bruta", categoriaOriginal: "Receita Bruta", valor: base },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "deducoes_abatimentos", categoriaOriginal: "Deduções e Abatimentos", valor: base * 0.082 },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "cpv_cmv", categoriaOriginal: "CPV/CMV", valor: base * 0.34 },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "despesas_vendas", categoriaOriginal: "Despesas com Vendas", valor: base * 0.11 },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "despesas_administrativas", categoriaOriginal: "Despesas Administrativas", valor: base * 0.16 },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "despesas_financeiras", categoriaOriginal: "Despesas Financeiras", valor: base * 0.028 },
			{ competenciaAno: ano, competenciaMes: mes, linhaDre: "provisoes_irpj_csll", categoriaOriginal: "Provisões IRPJ e CSLL", valor: base * 0.045 },
		);
	}
	return replaceDreLancamentos(
		{ rows, fileName: "dados-ficticios-dre", isFake: true },
		user,
	);
}

async function deleteFakeDreLancamentos(user = {}) {
	const result = await db.query("delete from dre_lancamentos where is_fake = true");
	await appendImportLog({
		sourceId: "dre",
		label: "DRE",
		status: "ok",
		message: "Dados fictícios de DRE apagados.",
		importedRows: 0,
		deletedRows: result.rowCount || 0,
		userId: text(user.uid || user.email),
	});
	return { ok: true, deletedRows: result.rowCount || 0 };
}

async function saveSerasaFinancialReport(data = {}) {
	return saveSerasaReport(data);
}

async function getSerasaFinancialReport() {
	return getSerasaReport();
}

async function clearSerasaFinancialReport(data = {}) {
	return clearSerasaReport(data);
}

async function saveTariffsFinancialReport(data = {}) {
	return saveTariffsReport(data);
}

async function getTariffsFinancialReport() {
	return getTariffsReport();
}

async function clearTariffsFinancialReport(data = {}) {
	return clearTariffsReport(data);
}

async function recordFinanceiroImportLog(data = {}) {
	return appendImportLog(data);
}

async function listFinanceiroImportLogs(limit = 20) {
	return listImportLogs(limit);
}

module.exports = {
	appendImportLog,
	clearSerasaReport,
	clearSerasaFinancialReport,
	clearTariffsReport,
	clearTariffsFinancialReport,
	getSerasaReport,
	getSerasaFinancialReport,
	getTariffsReport,
	getTariffsFinancialReport,
	listDreLancamentos,
	listFinanceiroImportLogs,
	listImportLogs,
	recordFinanceiroImportLog,
	replaceDreLancamentos,
	createFakeDreLancamentos,
	deleteFakeDreLancamentos,
	saveSerasaReport,
	saveSerasaFinancialReport,
	saveTariffsReport,
	saveTariffsFinancialReport,
	// Exportado só para teste (S-A, docs/SONARQUBE-MAP.md): garante que a
	// ordenação de chaves do hash de mudança é determinística.
	stableStringify,
};
