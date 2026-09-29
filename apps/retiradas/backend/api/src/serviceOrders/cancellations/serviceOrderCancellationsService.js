const db = require("../../db");

const TIME_ZONE = "America/Sao_Paulo";
const METABASE_CARD_UUID = "7c9f15dd-1e51-4c77-bc7c-d19cc74218f1";
const METABASE_BASE_URL = "https://bi.sempre.hubsoft.com.br:8443";
const VIEW_PERMISSIONS = [
	"service_orders.cancellations.view",
	"service_orders.cancellations.manage",
	"view_metas",
	"manage_metas",
];
const MANAGE_PERMISSIONS = [
	"service_orders.cancellations.manage",
	"manage_metas",
];

const METABASE_PARAMETERS = {
	dataCancelamento: {
		id: "2dad0509-7680-2dfd-7d9d-80bda5e4f52f",
		type: "date/all-options",
		target: ["dimension", ["template-tag", "data_cancelamento"]],
	},
	churn: {
		id: "fcd3bea5-6c24-9f94-14ba-7549930657e2",
		type: "category",
		target: ["variable", ["template-tag", "motivo_cancelamento_gera_grafico"]],
	},
	tipo: {
		id: "a597b09d-789b-aef2-4a30-85976ca92ddd",
		type: "category",
		target: ["variable", ["template-tag", "tipo"]],
	},
};

function cleanText(value) {
	return String(value ?? "").trim();
}

function normalizeKey(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

function parsePositiveInteger(value, fallback, max) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function parseCompetencia(value) {
	const text = cleanText(value);
	return /^\d{4}-\d{2}$/.test(text) ? text : currentCompetencia();
}

function currentCompetencia() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
	}).format(new Date());
}

function parseDate(value) {
	const text = cleanText(value);
	if (!text) return null;
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (match) return `${match[1]}-${match[2]}-${match[3]}`;
	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getMonthRange(competencia) {
	const [year, month] = parseCompetencia(competencia).split("-").map(Number);
	const start = `${year}-${String(month).padStart(2, "0")}-01`;
	const endDate = new Date(Date.UTC(year, month, 0, 12));
	return {
		startDate: start,
		endDate: endDate.toISOString().slice(0, 10),
		metabaseRange: `${start}~${endDate.toISOString().slice(0, 10)}`,
	};
}

function addMonth(competencia, amount) {
	const [year, month] = parseCompetencia(competencia).split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function listCompetenciasInRange(startCompetencia, endCompetencia) {
	let current = parseCompetencia(startCompetencia);
	const end = parseCompetencia(endCompetencia);
	if (current > end) return listCompetenciasInRange(end, current);
	const values = [];
	while (current <= end && values.length < 240) {
		values.push(current);
		current = addMonth(current, 1);
	}
	return values;
}

function parseNumber(value) {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const normalized = cleanText(value).replace(/\./g, "").replace(",", ".");
	const number = Number(normalized);
	return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
	const number = Number.parseInt(value, 10);
	return Number.isFinite(number) ? number : null;
}

function normalizeTechnology(row = {}) {
	const original = cleanText(row.tecnologia);
	const haystack = normalizeKey([
		row.tecnologia,
		row.servico,
		row.grupo_servico,
		row.grupo_padrao,
	].join(" "));
	if (
		haystack.includes("FIBRA") ||
		haystack.includes("FIBRA OPTICA") ||
		haystack.includes("FTTH")
	) {
		return { original, classification: "FTTH" };
	}
	return { original, classification: "NAO_FTTH" };
}

function normalizeCompany(row = {}) {
	const sources = [
		row.empresa_cluster,
		row.grupo_servico,
		row.grupo_padrao,
		row.grupo_permissao,
		row.setor,
		row.forma_cobranca,
		row.servico,
		row.motivo_cancelamento,
	].filter((value) => cleanText(value));
	const original = sources[0] || "";
	const haystack = normalizeKey(sources.join(" "));
	if (haystack.includes("ONNET")) {
		return { original, normalized: "ONNET" };
	}
	return { original: original || "SEMPRE", normalized: "SEMPRE" };
}

function userDisplayName(user = {}) {
	return (
		cleanText(user?.profile?.nome) ||
		cleanText(user?.nome) ||
		cleanText(user?.name) ||
		cleanText(user?.email) ||
		cleanText(user?.uid) ||
		"Sistema"
	);
}

function buildUniqueKey(row = {}) {
	return [
		cleanText(row.id_cliente || row.codigo_cliente || "sem-cliente"),
		cleanText(row.id_cliente_servico || row.numero_plano || "sem-servico"),
		parseDate(row.data_cancelamento) || "sem-data",
	].join("|");
}

async function loadRegionalMap() {
	const result = await db.query(
		`select c.nome as cidade, r.id as regional_id, r.nome as regional_nome
		   from regional_cidades c
		   join regionais r on r.id = c.regional_id
		  where r.ativo is distinct from false`,
	);
	const map = new Map();
	for (const row of result.rows) {
		map.set(normalizeCityKey(row.cidade), row);
	}
	return map;
}

function mapHubsoftRow(row = {}, competencia, regionalMap = new Map()) {
	const dataCancelamento = parseDate(row.data_cancelamento);
	const company = normalizeCompany(row);
	const technology = normalizeTechnology(row);
	const cidade = cleanText(row.cidade);
	const regional = regionalMap.get(normalizeCityKey(cidade)) || {};
	return {
		competencia,
		uniqueKey: buildUniqueKey(row),
		codigoCliente: cleanText(row.codigo_cliente),
		clienteId: cleanText(row.id_cliente),
		clienteServicoId: cleanText(row.id_cliente_servico),
		clienteNome: cleanText(row["RAZÃO SOCIAL"] || row.razao_social || row.cliente),
		numeroPlano: cleanText(row.numero_plano),
		empresaOriginal: company.original,
		empresaNormalizada: company.normalized,
		servico: cleanText(row.servico),
		tecnologiaOriginal: technology.original,
		classificacaoTecnologia: technology.classification,
		grupoServico: cleanText(row.grupo_servico),
		grupoPadrao: cleanText(row.grupo_padrao),
		velocidade: parseNumber(row.velocidade),
		dataCancelamento,
		motivoCancelamento: cleanText(row.motivo_cancelamento),
		usuarioCancelamento: cleanText(row.usuario_cancelamento),
		cidade,
		cidadeNormalizada: normalizeCityKey(cidade),
		regionalId: regional.regional_id || null,
		regionalNome: regional.regional_nome || null,
		bairro: cleanText(row.bairro),
		endereco: cleanText(row["endereco_instalação"] || row.endereco_instalacao),
		equipamentoComodato: cleanText(row.equipamento_comodato),
		valor: parseNumber(row.valor),
		faturasGeradas: parseInteger(row.faturas_geradas),
		faturasQuitadas: parseInteger(row.faturas_quitadas),
		faturasEmAberto: parseInteger(row.faturas_em_aberto),
		payloadOriginal: row,
	};
}

function buildMetabaseParameters(competencia) {
	const { metabaseRange } = getMonthRange(competencia);
	return [
		{
			...METABASE_PARAMETERS.dataCancelamento,
			value: metabaseRange,
		},
		{
			...METABASE_PARAMETERS.churn,
			value: "S",
		},
		{
			...METABASE_PARAMETERS.tipo,
			value: "V",
		},
	];
}

async function fetchMetabaseJson(competencia) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		Number(process.env.HUBSOFT_CANCELLATIONS_TIMEOUT_MS || 180000),
	);
	const parameters = encodeURIComponent(
		JSON.stringify(buildMetabaseParameters(competencia)),
	);
	const url = `${METABASE_BASE_URL}/api/public/card/${METABASE_CARD_UUID}/query/json?parameters=${parameters}`;
	try {
		const response = await fetch(url, {
			headers: { accept: "application/json" },
			signal: controller.signal,
		});
		const text = await response.text();
		if (!response.ok) {
			const error = new Error(
				`Fonte HubSoft indisponivel (${response.status}).`,
			);
			error.statusCode = 502;
			error.details = text.slice(0, 500);
			throw error;
		}
		const payload = JSON.parse(text);
		return Array.isArray(payload) ? payload : [];
	} catch (error) {
		if (error.name === "AbortError") {
			const timeoutError = new Error("Consulta ao BI do HubSoft expirou.");
			timeoutError.statusCode = 504;
			throw timeoutError;
		}
		if (error.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
			const timeoutError = new Error(
				"BI do HubSoft indisponivel para a VPS de homologacao.",
			);
			timeoutError.statusCode = 504;
			throw timeoutError;
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

function emptySummary() {
	return {
		geral: { ftth: 0, naoFtth: 0, total: 0 },
		empresas: {},
		equipamentos: { comEquipamento: 0, semEquipamento: 0 },
	};
}

function addToSummary(summary, row) {
	const company = row.empresa_normalizada || row.empresaNormalizada || "SEMPRE";
	const classification =
		row.classificacao_tecnologia || row.classificacaoTecnologia || "NAO_FTTH";
	if (!summary.empresas[company]) {
		summary.empresas[company] = { ftth: 0, naoFtth: 0, total: 0 };
	}
	const key = classification === "FTTH" ? "ftth" : "naoFtth";
	summary.geral[key] += 1;
	summary.geral.total += 1;
	summary.empresas[company][key] += 1;
	summary.empresas[company].total += 1;
	const equipment = cleanText(row.equipamento_comodato || row.equipamentoComodato);
	if (equipment) summary.equipamentos.comEquipamento += 1;
	else summary.equipamentos.semEquipamento += 1;
}

function buildSummary(rows = []) {
	const summary = emptySummary();
	rows.forEach((row) => addToSummary(summary, row));
	return summary;
}

async function summarizeCompetencia(client, competencia) {
	const result = await client.query(
		`select empresa_normalizada, classificacao_tecnologia, equipamento_comodato
		   from service_order_cancellation_records
		  where competencia = $1`,
		[competencia],
	);
	return buildSummary(result.rows);
}

function summariesDiffer(left, right) {
	return JSON.stringify(left || {}) !== JSON.stringify(right || {});
}

async function upsertCompetencyShell(client, competencia, status, runId = null) {
	await client.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, last_sync_run_id, last_error)
		 values ($1, $2, $3, null)
		 on conflict (competencia) do update set
		   status = excluded.status,
		   last_sync_run_id = coalesce(excluded.last_sync_run_id, service_order_cancellation_competencies.last_sync_run_id),
		   last_error = null`,
		[competencia, status, runId],
	);
}

async function upsertCancellationRecord(client, record) {
	const result = await client.query(
		`insert into service_order_cancellation_records (
			competencia, unique_key, codigo_cliente, cliente_id, cliente_servico_id,
			cliente_nome, numero_plano, empresa_original, empresa_normalizada,
			servico, tecnologia_original, classificacao_tecnologia, grupo_servico,
			grupo_padrao, velocidade, data_cancelamento, motivo_cancelamento,
			usuario_cancelamento, cidade, cidade_normalizada, regional_id,
			regional_nome, bairro, endereco, equipamento_comodato, valor,
			faturas_geradas, faturas_quitadas, faturas_em_aberto, payload_original,
			synced_at
		) values (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
			$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,now()
		)
		on conflict (competencia, unique_key) do update set
			codigo_cliente = excluded.codigo_cliente,
			cliente_id = excluded.cliente_id,
			cliente_servico_id = excluded.cliente_servico_id,
			cliente_nome = excluded.cliente_nome,
			numero_plano = excluded.numero_plano,
			empresa_original = excluded.empresa_original,
			empresa_normalizada = excluded.empresa_normalizada,
			servico = excluded.servico,
			tecnologia_original = excluded.tecnologia_original,
			classificacao_tecnologia = excluded.classificacao_tecnologia,
			grupo_servico = excluded.grupo_servico,
			grupo_padrao = excluded.grupo_padrao,
			velocidade = excluded.velocidade,
			data_cancelamento = excluded.data_cancelamento,
			motivo_cancelamento = excluded.motivo_cancelamento,
			usuario_cancelamento = excluded.usuario_cancelamento,
			cidade = excluded.cidade,
			cidade_normalizada = excluded.cidade_normalizada,
			regional_id = excluded.regional_id,
			regional_nome = excluded.regional_nome,
			bairro = excluded.bairro,
			endereco = excluded.endereco,
			equipamento_comodato = excluded.equipamento_comodato,
			valor = excluded.valor,
			faturas_geradas = excluded.faturas_geradas,
			faturas_quitadas = excluded.faturas_quitadas,
			faturas_em_aberto = excluded.faturas_em_aberto,
			payload_original = excluded.payload_original,
			synced_at = now()
		returning (xmax = 0) as inserted`,
		[
			record.competencia,
			record.uniqueKey,
			record.codigoCliente || null,
			record.clienteId || null,
			record.clienteServicoId || null,
			record.clienteNome || null,
			record.numeroPlano || null,
			record.empresaOriginal || null,
			record.empresaNormalizada,
			record.servico || null,
			record.tecnologiaOriginal || null,
			record.classificacaoTecnologia,
			record.grupoServico || null,
			record.grupoPadrao || null,
			record.velocidade,
			record.dataCancelamento,
			record.motivoCancelamento || null,
			record.usuarioCancelamento || null,
			record.cidade || null,
			record.cidadeNormalizada || null,
			record.regionalId,
			record.regionalNome,
			record.bairro || null,
			record.endereco || null,
			record.equipamentoComodato || null,
			record.valor,
			record.faturasGeradas,
			record.faturasQuitadas,
			record.faturasEmAberto,
			JSON.stringify(record.payloadOriginal || {}),
		],
	);
	return result.rows[0]?.inserted ? "inserted" : "updated";
}

async function finishCompetency(client, competencia, runId, summary, total) {
	const current = await client.query(
		`select validation_status, validated_summary
		   from service_order_cancellation_competencies
		  where competencia = $1
		  for update`,
		[competencia],
	);
	const row = current.rows[0] || {};
	let validationStatus = row.validation_status || "PENDING";
	if (
		validationStatus === "VALIDATED" &&
		summariesDiffer(row.validated_summary, summary)
	) {
		validationStatus = "REQUIRES_REVALIDATION";
	}
	await client.query(
		`update service_order_cancellation_competencies
		    set status = 'SYNCED',
		        validation_status = $2,
		        total_records = $3,
		        summary = $4::jsonb,
		        last_sync_run_id = $5,
		        last_synced_at = now(),
		        last_error = null
		  where competencia = $1`,
		[competencia, validationStatus, total, JSON.stringify(summary), runId],
	);
}

async function syncCompetencia(competencia, user = {}, parentRunId = null) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const startedAt = Date.now();
	const client = await db.connect();
	let runId = parentRunId;
	try {
		await client.query("begin");
		if (!runId) {
			const run = await client.query(
				`insert into service_order_cancellation_sync_runs
				 (competencia, status, triggered_by_uid, triggered_by_name)
				 values ($1, 'RUNNING', $2, $3)
				 returning id`,
				[normalizedCompetencia, user.uid || null, userDisplayName(user)],
			);
			runId = run.rows[0].id;
		}
		await upsertCompetencyShell(client, normalizedCompetencia, "SYNCING", runId);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}

	let records = [];
	let keys = [];
	try {
		const rows = await fetchMetabaseJson(normalizedCompetencia);
		const regionalMap = await loadRegionalMap();
		records = rows
			.map((row) => mapHubsoftRow(row, normalizedCompetencia, regionalMap))
			.filter((record) => record.dataCancelamento);
		keys = records.map((record) => record.uniqueKey);
	} catch (error) {
		await markSyncFailed(runId, normalizedCompetencia, error);
		throw error;
	}
	let inserted = 0;
	let updated = 0;
	let deleted = 0;
	const writeClient = await db.connect();
	try {
		await writeClient.query("begin");
		await upsertCompetencyShell(writeClient, normalizedCompetencia, "SYNCING", runId);
		for (const record of records) {
			const action = await upsertCancellationRecord(writeClient, record);
			if (action === "inserted") inserted += 1;
			else updated += 1;
		}
		const deletedResult = await writeClient.query(
			`delete from service_order_cancellation_records
			  where competencia = $1
			    and not (unique_key = any($2::text[]))`,
			[normalizedCompetencia, keys],
		);
		deleted = deletedResult.rowCount || 0;
		const summary = await summarizeCompetencia(writeClient, normalizedCompetencia);
		await finishCompetency(
			writeClient,
			normalizedCompetencia,
			runId,
			summary,
			records.length,
		);
		await writeClient.query(
			`update service_order_cancellation_sync_runs
			    set status = 'COMPLETE',
			        finished_at = now(),
			        duration_ms = $2,
			        total_hubsoft = $3,
			        inserted_count = $4,
			        updated_count = $5,
			        deleted_count = $6,
			        summary = $7::jsonb
			  where id = $1`,
			[
				runId,
				Date.now() - startedAt,
				records.length,
				inserted,
				updated,
				deleted,
				JSON.stringify(summary),
			],
		);
		await writeClient.query("commit");
		return {
			id: runId,
			competencia: normalizedCompetencia,
			status: "COMPLETE",
			total: records.length,
			inserted,
			updated,
			deleted,
			summary,
		};
	} catch (error) {
		await writeClient.query("rollback").catch(() => {});
		await markSyncFailed(runId, normalizedCompetencia, error);
		throw error;
	} finally {
		writeClient.release();
	}
}

async function markSyncFailed(runId, competencia, error) {
	await db.query(
		`update service_order_cancellation_sync_runs
		    set status = 'FAILED',
		        finished_at = now(),
		        error_message = $2
		  where id = $1`,
		[runId, error?.message || "Falha na sincronizacao."],
	).catch(() => {});
	await db.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, validation_status, last_sync_run_id, last_error)
		 values ($1, 'ERROR', 'PENDING', $2, $3)
		 on conflict (competencia) do update set
		   status = 'ERROR',
		   last_sync_run_id = $2,
		   last_error = $3`,
		[competencia, runId, error?.message || "Falha na sincronizacao."],
	).catch(() => {});
}

function runAsync(task) {
	setImmediate(() => {
		task().catch((error) => {
			console.error("[service-order-cancellations]", error);
		});
	});
}

async function startSync(body = {}, user = {}) {
	const competencia = parseCompetencia(body.competencia);
	const result = await db.query(
		`insert into service_order_cancellation_sync_runs
		 (competencia, status, triggered_by_uid, triggered_by_name)
		 values ($1, 'RUNNING', $2, $3)
		 returning *`,
		[competencia, user.uid || null, userDisplayName(user)],
	);
	const run = result.rows[0];
	await db.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, last_sync_run_id, last_error)
		 values ($1, 'SYNCING', $2, null)
		 on conflict (competencia) do update set
		   status = 'SYNCING',
		   last_sync_run_id = excluded.last_sync_run_id,
		   last_error = null`,
		[competencia, run.id],
	);
	runAsync(() => syncCompetencia(competencia, user, run.id));
	return { run: mapSyncRun(run) };
}

async function startHistorySync(body = {}, user = {}) {
	const startCompetencia = parseCompetencia(body.startCompetencia || body.start);
	const endCompetencia = parseCompetencia(body.endCompetencia || body.end);
	const competencias = listCompetenciasInRange(startCompetencia, endCompetencia);
	const result = await db.query(
		`insert into service_order_cancellation_sync_runs
		 (start_competencia, end_competencia, status, triggered_by_uid, triggered_by_name)
		 values ($1, $2, 'RUNNING', $3, $4)
		 returning *`,
		[startCompetencia, endCompetencia, user.uid || null, userDisplayName(user)],
	);
	const run = result.rows[0];
	runAsync(async () => {
		let total = 0;
		const summary = {};
		try {
			for (const competencia of competencias) {
				const monthResult = await syncCompetencia(competencia, user);
				total += monthResult.total || 0;
				summary[competencia] = monthResult.summary || {};
			}
			await db.query(
				`update service_order_cancellation_sync_runs
				    set status = 'COMPLETE',
				        finished_at = now(),
				        duration_ms = extract(epoch from (now() - started_at))::int * 1000,
				        total_hubsoft = $2,
				        summary = $3::jsonb
				  where id = $1`,
				[run.id, total, JSON.stringify(summary)],
			);
		} catch (error) {
			await db.query(
				`update service_order_cancellation_sync_runs
				    set status = 'FAILED',
				        finished_at = now(),
				        error_message = $2
				  where id = $1`,
				[run.id, error?.message || "Falha na sincronizacao historica."],
			).catch(() => {});
		}
	});
	return { run: mapSyncRun(run), competencias };
}

function makeParamBuilder() {
	const values = [];
	return {
		add(value) {
			values.push(value);
			return `$${values.length}`;
		},
		values,
	};
}

function buildFilters(query = {}) {
	const params = makeParamBuilder();
	const competencia = parseCompetencia(query.competencia);
	const clauses = [`competencia = ${params.add(competencia)}`];
	const exactFilters = [
		["empresa", "empresa_normalizada"],
		["classificacao", "classificacao_tecnologia"],
		["regional", "regional_id"],
		["cidade", "cidade"],
		["tecnologia", "tecnologia_original"],
		["motivo", "motivo_cancelamento"],
		["servico", "servico"],
	];
	for (const [input, column] of exactFilters) {
		const value = cleanText(query[input]);
		if (value && value !== "TODOS" && value !== "all") {
			clauses.push(`${column} = ${params.add(value)}`);
		}
	}
	const search = cleanText(query.q || query.search);
	if (search) {
		const term = `%${search.toLowerCase()}%`;
		clauses.push(`(
			lower(coalesce(cliente_nome, '')) like ${params.add(term)}
			or lower(coalesce(codigo_cliente, '')) like ${params.add(term)}
			or lower(coalesce(cliente_id, '')) like ${params.add(term)}
			or lower(coalesce(cliente_servico_id, '')) like ${params.add(term)}
			or lower(coalesce(servico, '')) like ${params.add(term)}
		)`);
	}
	return { where: clauses.join("\n and "), values: params.values, competencia };
}

function mapRecord(row = {}) {
	return {
		id: row.id,
		competencia: row.competencia,
		codigoCliente: row.codigo_cliente,
		clienteId: row.cliente_id,
		clienteServicoId: row.cliente_servico_id,
		clienteNome: row.cliente_nome,
		numeroPlano: row.numero_plano,
		empresaOriginal: row.empresa_original,
		empresa: row.empresa_normalizada,
		servico: row.servico,
		tecnologiaOriginal: row.tecnologia_original,
		classificacaoTecnologia: row.classificacao_tecnologia,
		grupoServico: row.grupo_servico,
		grupoPadrao: row.grupo_padrao,
		velocidade: row.velocidade === null ? null : Number(row.velocidade),
		dataCancelamento: row.data_cancelamento,
		motivoCancelamento: row.motivo_cancelamento,
		usuarioCancelamento: row.usuario_cancelamento,
		cidade: row.cidade,
		regionalId: row.regional_id,
		regionalNome: row.regional_nome,
		bairro: row.bairro,
		endereco: row.endereco,
		equipamentoComodato: row.equipamento_comodato,
		valor: row.valor === null ? null : Number(row.valor),
		faturasGeradas: row.faturas_geradas,
		faturasQuitadas: row.faturas_quitadas,
		faturasEmAberto: row.faturas_em_aberto,
		payloadOriginal: row.payload_original,
		syncedAt: row.synced_at,
	};
}

function mapCompetency(row = {}) {
	return {
		competencia: row.competencia,
		status: row.status || "NOT_SYNCED",
		validationStatus: row.validation_status || "PENDING",
		totalRecords: Number(row.total_records || 0),
		summary: row.summary || emptySummary(),
		validatedSummary: row.validated_summary || null,
		validatedBy: row.validated_by_name || null,
		validatedAt: row.validated_at || null,
		lastSyncRunId: row.last_sync_run_id || null,
		lastSyncedAt: row.last_synced_at || null,
		lastError: row.last_error || null,
	};
}

function mapSyncRun(row = {}) {
	return {
		id: row.id,
		competencia: row.competencia,
		startCompetencia: row.start_competencia,
		endCompetencia: row.end_competencia,
		status: row.status,
		triggeredBy: row.triggered_by_name,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		durationMs: row.duration_ms,
		totalHubsoft: Number(row.total_hubsoft || 0),
		inserted: Number(row.inserted_count || 0),
		updated: Number(row.updated_count || 0),
		deleted: Number(row.deleted_count || 0),
		summary: row.summary || {},
		error: row.error_message || null,
	};
}

async function listCancellations(query = {}) {
	const page = parsePositiveInteger(query.page, 1, 100000);
	const limit = parsePositiveInteger(query.limit, 50, 100);
	const offset = (page - 1) * limit;
	const { where, values } = buildFilters(query);
	const totalResult = await db.query(
		`select count(*)::int as total
		   from service_order_cancellation_records
		  where ${where}`,
		values,
	);
	const result = await db.query(
		`select *
		   from service_order_cancellation_records
		  where ${where}
		  order by data_cancelamento desc, cliente_nome nulls last
		  limit $${values.length + 1}
		  offset $${values.length + 2}`,
		[...values, limit, offset],
	);
	const total = Number(totalResult.rows[0]?.total || 0);
	return {
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
		data: result.rows.map(mapRecord),
	};
}

async function getRecord(id) {
	const result = await db.query(
		`select * from service_order_cancellation_records where id = $1`,
		[id],
	);
	return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

async function getSummary(query = {}) {
	const competencia = parseCompetencia(query.competencia);
	const competency = await getCompetency(competencia);
	const [empresa, regional, cidade, tecnologia] = await Promise.all([
		groupBy(competencia, "empresa_normalizada"),
		groupByRegional(competencia),
		groupByCity(competencia),
		groupByTechnology(competencia),
	]);
	return {
		competencia: competency,
		porEmpresa: empresa,
		porRegional: regional,
		porCidade: cidade,
		tecnologias: tecnologia,
	};
}

async function getCompetency(competencia) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const result = await db.query(
		`select * from service_order_cancellation_competencies where competencia = $1`,
		[normalizedCompetencia],
	);
	return result.rows[0]
		? mapCompetency(result.rows[0])
		: {
				competencia: normalizedCompetencia,
				status: "NOT_SYNCED",
				validationStatus: "PENDING",
				totalRecords: 0,
				summary: emptySummary(),
			};
}

async function listCompetencies() {
	const result = await db.query(
		`select *
		   from service_order_cancellation_competencies
		  order by competencia desc
		  limit 120`,
	);
	return { items: result.rows.map(mapCompetency) };
}

async function groupBy(competencia, column) {
	const result = await db.query(
		`select ${column} as name,
		        count(*) filter (where classificacao_tecnologia = 'FTTH')::int as ftth,
		        count(*) filter (where classificacao_tecnologia = 'NAO_FTTH')::int as nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by ${column}
		  order by total desc, name`,
		[competencia],
	);
	return result.rows.map((row) => ({
		name: row.name || "Nao informado",
		ftth: Number(row.ftth || 0),
		naoFtth: Number(row.nao_ftth || 0),
		total: Number(row.total || 0),
		ftthPercent: Number(row.total) ? (Number(row.ftth) / Number(row.total)) * 100 : 0,
	}));
}

async function groupByRegional(competencia) {
	const result = await db.query(
		`select coalesce(regional_nome, 'Sem regional') as regional,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'FTTH')::int as sempre_ftth,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'NAO_FTTH')::int as sempre_nao_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'FTTH')::int as onnet_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'NAO_FTTH')::int as onnet_nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by coalesce(regional_nome, 'Sem regional')
		  order by total desc, regional`,
		[competencia],
	);
	return result.rows.map((row) => ({
		regional: row.regional,
		sempreFtth: Number(row.sempre_ftth || 0),
		sempreNaoFtth: Number(row.sempre_nao_ftth || 0),
		onnetFtth: Number(row.onnet_ftth || 0),
		onnetNaoFtth: Number(row.onnet_nao_ftth || 0),
		total: Number(row.total || 0),
	}));
}

async function groupByCity(competencia) {
	const result = await db.query(
		`select coalesce(cidade, 'Sem cidade') as cidade,
		        coalesce(regional_nome, 'Sem regional') as regional,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'FTTH')::int as sempre_ftth,
		        count(*) filter (where empresa_normalizada = 'SEMPRE' and classificacao_tecnologia = 'NAO_FTTH')::int as sempre_nao_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'FTTH')::int as onnet_ftth,
		        count(*) filter (where empresa_normalizada = 'ONNET' and classificacao_tecnologia = 'NAO_FTTH')::int as onnet_nao_ftth,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by coalesce(cidade, 'Sem cidade'), coalesce(regional_nome, 'Sem regional')
		  order by total desc, cidade
		  limit 500`,
		[competencia],
	);
	return result.rows.map((row) => ({
		cidade: row.cidade,
		regional: row.regional,
		sempreFtth: Number(row.sempre_ftth || 0),
		sempreNaoFtth: Number(row.sempre_nao_ftth || 0),
		onnetFtth: Number(row.onnet_ftth || 0),
		onnetNaoFtth: Number(row.onnet_nao_ftth || 0),
		total: Number(row.total || 0),
	}));
}

async function groupByTechnology(competencia) {
	const result = await db.query(
		`select coalesce(tecnologia_original, 'Sem tecnologia') as tecnologia,
		        empresa_normalizada as empresa,
		        classificacao_tecnologia as classificacao,
		        count(*)::int as total
		   from service_order_cancellation_records
		  where competencia = $1
		  group by coalesce(tecnologia_original, 'Sem tecnologia'), empresa_normalizada, classificacao_tecnologia
		  order by total desc, tecnologia`,
		[competencia],
	);
	return result.rows.map((row) => ({
		tecnologia: row.tecnologia,
		empresa: row.empresa,
		classificacao: row.classificacao,
		total: Number(row.total || 0),
	}));
}

async function listFilterOptions(query = {}) {
	const competencia = parseCompetencia(query.competencia);
	const columns = {
		empresas: "empresa_normalizada",
		regionais: "regional_nome",
		cidades: "cidade",
		tecnologias: "tecnologia_original",
		motivos: "motivo_cancelamento",
		servicos: "servico",
	};
	const entries = await Promise.all(
		Object.entries(columns).map(async ([key, column]) => {
			const result = await db.query(
				`select distinct ${column} as value
				   from service_order_cancellation_records
				  where competencia = $1
				    and ${column} is not null
				    and ${column} <> ''
				  order by ${column}
				  limit 1000`,
				[competencia],
			);
			return [key, result.rows.map((row) => row.value)];
		}),
	);
	return Object.fromEntries(entries);
}

async function validateCompetency(competencia, user = {}) {
	const normalizedCompetencia = parseCompetencia(competencia);
	const summary = await getSummary({ competencia: normalizedCompetencia });
	await db.query(
		`insert into service_order_cancellation_competencies
		 (competencia, status, validation_status, summary, validated_summary,
		  validated_by_uid, validated_by_name, validated_at)
		 values ($1, 'SYNCED', 'VALIDATED', $2::jsonb, $2::jsonb, $3, $4, now())
		 on conflict (competencia) do update set
		   validation_status = 'VALIDATED',
		   validated_summary = $2::jsonb,
		   validated_by_uid = $3,
		   validated_by_name = $4,
		   validated_at = now(),
		   last_error = null`,
		[
			normalizedCompetencia,
			JSON.stringify(summary.competencia.summary || emptySummary()),
			user.uid || null,
			userDisplayName(user),
		],
	);
	return getCompetency(normalizedCompetencia);
}

async function listSyncHistory(query = {}) {
	const limit = parsePositiveInteger(query.limit, 20, 100);
	const result = await db.query(
		`select *
		   from service_order_cancellation_sync_runs
		  order by started_at desc
		  limit $1`,
		[limit],
	);
	return { items: result.rows.map(mapSyncRun) };
}

function escapeCsv(value) {
	const text = String(value ?? "");
	if (!/[",\n;]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(query = {}) {
	const { where, values } = buildFilters(query);
	const result = await db.query(
		`select *
		   from service_order_cancellation_records
		  where ${where}
		  order by data_cancelamento desc, cliente_nome nulls last`,
		values,
	);
	const columns = [
		["clienteNome", "Cliente"],
		["codigoCliente", "Codigo"],
		["clienteId", "ID Cliente"],
		["clienteServicoId", "ID Cliente Servico"],
		["empresa", "Empresa"],
		["servico", "Servico"],
		["tecnologiaOriginal", "Tecnologia"],
		["classificacaoTecnologia", "Classificacao"],
		["cidade", "Cidade"],
		["regionalNome", "Regional"],
		["dataCancelamento", "Data Cancelamento"],
		["motivoCancelamento", "Motivo"],
		["usuarioCancelamento", "Usuario Cancelamento"],
		["equipamentoComodato", "Equipamento Comodato"],
		["valor", "Valor"],
	];
	const lines = [columns.map(([, label]) => escapeCsv(label)).join(";")];
	for (const row of result.rows.map(mapRecord)) {
		lines.push(columns.map(([key]) => escapeCsv(row[key])).join(";"));
	}
	return Buffer.from(`\ufeff${lines.join("\n")}`, "utf8");
}

module.exports = {
	MANAGE_PERMISSIONS,
	VIEW_PERMISSIONS,
	exportCsv,
	getRecord,
	getSummary,
	listCancellations,
	listCompetencies,
	listFilterOptions,
	listSyncHistory,
	startHistorySync,
	startSync,
	validateCompetency,
	_normalizeCompany: normalizeCompany,
	_normalizeTechnology: normalizeTechnology,
	_parseCompetencia: parseCompetencia,
};
