const db = require("../../db");
const hubsoftSyncProfiles = require("../../hubsoftSyncProfiles");
const auditLog = require("../../auditLog");

const PERMISSIONS = Object.freeze({
	view: ["liberacao_portas.view"],
	search: ["liberacao_portas.search"],
	execute: ["liberacao_portas.execute"],
	history: ["liberacao_portas.history"],
	export: ["liberacao_portas.export"],
	manage: ["liberacao_portas.manage"],
});
const REASONS = new Set([
	"Classificação incorreta pelo Comercial",
	"Solicitação do Comercial",
	"Correção operacional",
	"Outros",
]);
const queue = [];
const queued = new Set();
let workers = 0;
let initialized = false;

function clean(value) {
	return String(value ?? "").trim();
}

function digits(value) {
	return clean(value).replace(/\D/g, "");
}

function normalizeStatus(value) {
	return clean(value?.valor || value?.value || value?.descricao || value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, "_");
}

function rowsOf(payload) {
	const rows = payload?.ordens_servico?.data || payload?.paginador?.data || payload?.data?.data || payload?.data || payload?.dados || [];
	return Array.isArray(rows) ? rows : [];
}

function orderPayload(payload) {
	return payload?.ordem_servico || payload?.data || null;
}

function orderId(order = {}) {
	return clean(order.id_ordem_servico || order.id);
}

function orderNumber(order = {}) {
	return digits(order.numero_ordem_servico || order.num_os || order.numero_os);
}

function clientCode(order = {}) {
	return digits(order.codigo_cliente || order.cliente?.codigo_cliente || order.cliente_servico?.cliente?.codigo_cliente);
}

function clientName(order = {}) {
	return clean(order.nome_razaosocial || order.cliente?.nome_razaosocial || order.cliente?.nome || order.cliente_servico?.cliente?.nome_razaosocial);
}

function orderType(order = {}) {
	return order.tipo_ordem_servico || order.ordem_servico_tipo || {};
}

function typeId(order = {}) {
	return Number(orderType(order)?.id_tipo_ordem_servico || order.id_tipo_ordem_servico || 0) || null;
}

function typeName(order = {}) {
	const type = orderType(order);
	return clean(type?.descricao || type?.display || type?.name || order.tipo || order.tipo_os);
}

function company(order = {}) {
	const source = order.empresa || order.cliente_servico?.empresa || order.filial || {};
	const key = clean(source.id_empresa || source.id || order.id_empresa || "DEFAULT");
	return { key, name: clean(source.razao_social || source.nome || source.descricao || order.nome_empresa || "Padrão") };
}

function saoPauloDay() {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
	}).format(new Date());
}

function evidence(order = {}) {
	return {
		serviceOrderId: orderId(order),
		serviceOrderNumber: orderNumber(order),
		clientCode: clientCode(order),
		typeId: typeId(order),
		typeName: typeName(order),
		status: normalizeStatus(order.status_ordem_servico || order.status),
	};
}

function classifyOrder(order, config) {
	const targetId = Number(config?.target_type?.id || 0);
	if (!config || !targetId) return "REVIEW_REQUIRED";
	if (typeId(order) === targetId) return "ALREADY_CLASSIFIED";
	return config.open_statuses.includes(normalizeStatus(order.status_ordem_servico || order.status)) && configuredTypeIds(config).includes(typeId(order))
		? "ELIGIBLE"
		: "REVIEW_REQUIRED";
}

function applyTargetType(order, target) {
	const updated = JSON.parse(JSON.stringify(order));
	updated.id_tipo_ordem_servico = Number(target.id_tipo_ordem_servico || target.id);
	updated.tipo_ordem_servico = target;
	return updated;
}

function parseCodes(input, maximum = 500) {
	const tokens = Array.isArray(input) ? input : clean(input).split(/[\s,;]+/);
	const valid = [];
	const invalid = [];
	const seen = new Set();
	for (const raw of tokens) {
		const code = clean(raw);
		if (!code) continue;
		if (!/^\d{1,20}$/.test(code)) {
			invalid.push(code);
			continue;
		}
		if (!seen.has(code)) {
			seen.add(code);
			valid.push(code);
		}
	}
	if (valid.length > maximum) {
		const error = new Error(`O limite configurado é de ${maximum} códigos por consulta.`);
		error.statusCode = 422;
		throw error;
	}
	return { valid, invalid, duplicates: tokens.filter(Boolean).length - valid.length - invalid.length };
}

function actor(user = {}) {
	const profile = user.profile || user;
	return {
		id: clean(user.uid || profile.uid || user.email || profile.email),
		name: clean(profile.nome || profile.displayName || user.nome || user.email || profile.email),
	};
}

function publicOperation(row = {}) {
	return {
		id: row.id,
		batchId: row.batch_id,
		clientCode: row.client_code,
		clientName: row.client_name || "",
		serviceOrderId: row.service_order_id,
		serviceOrderNumber: row.service_order_number || "",
		companyKey: row.company_key,
		companyName: row.company_name || "",
		sourceTypeId: row.source_type_id,
		sourceTypeName: row.source_type_name || "",
		targetTypeId: row.target_type_id,
		targetTypeName: row.target_type_name,
		status: row.status,
		reason: row.reason,
		note: row.note || "",
		requestedBy: row.requested_by,
		requestedByName: row.requested_by_name,
		requestedAt: row.requested_at,
		confirmedAt: row.confirmed_at,
		externalOperationId: row.external_operation_id || "",
		errorMessage: row.error_message || "",
	};
}

async function getConfigs() {
	const result = await db.query("select * from service_order_port_release_config order by company_name");
	return result.rows;
}

function configFor(configs, order = {}) {
	const info = company(order);
	return configs.find((item) => clean(item.company_key) === info.key) || configs.find((item) => item.company_key === "DEFAULT") || null;
}

function configuredTypeIds(config) {
	return (Array.isArray(config?.source_types) ? config.source_types : []).map((item) => Number(item.id)).filter(Boolean);
}

async function catalog() {
	const session = await hubsoftSyncProfiles.createAutomationSession();
	const payload = await hubsoftSyncProfiles.automationRequest(session, "/api/v1/ordem_servico/create");
	return {
		types: (payload?.tipos_ordem_servico || []).map((item) => ({
			id: Number(item.id_tipo_ordem_servico || item.id),
			name: clean(item.descricao || item.display || item.name),
		})).filter((item) => item.id && item.name),
	};
}

async function saveConfig(input = {}, user = {}) {
	const companyKey = clean(input.companyKey || "DEFAULT");
	const sourceTypes = Array.isArray(input.sourceTypes) ? input.sourceTypes.filter((item) => Number(item?.id) && clean(item?.name)) : [];
	const targetType = Number(input.targetType?.id) && clean(input.targetType?.name) ? { id: Number(input.targetType.id), name: clean(input.targetType.name) } : null;
	const openStatuses = (Array.isArray(input.openStatuses) ? input.openStatuses : []).map(normalizeStatus).filter(Boolean);
	if (!sourceTypes.length || !targetType || !openStatuses.length) {
		const error = new Error("Informe os tipos de origem, o tipo de destino real e os status abertos.");
		error.statusCode = 422;
		throw error;
	}
	const owner = actor(user);
	const result = await db.query(
		`insert into service_order_port_release_config
		 (company_key, company_name, source_types, target_type, open_statuses, batch_limit, concurrency, updated_by)
		 values ($1, $2, $3::jsonb, $4::jsonb, $5::text[], $6, $7, $8)
		 on conflict (company_key) do update set company_name = excluded.company_name,
		 source_types = excluded.source_types, target_type = excluded.target_type,
		 open_statuses = excluded.open_statuses, batch_limit = excluded.batch_limit,
		 concurrency = excluded.concurrency, updated_by = excluded.updated_by, updated_at = now()
		 returning *`,
		[companyKey, clean(input.companyName || "Padrão"), JSON.stringify(sourceTypes), JSON.stringify(targetType), openStatuses,
		 Math.min(Math.max(Number(input.batchLimit || 500), 1), 5000), Math.min(Math.max(Number(input.concurrency || 2), 1), 5), owner.id],
	);
	auditLog.recordAuditLog({ action: "update", module: "service_orders", entity: "port_release_config", recordId: companyKey,
		userId: owner.id, userName: owner.name, beforeData: null, afterData: { companyKey, sourceTypeIds: sourceTypes.map((item) => item.id), targetTypeId: targetType.id, openStatuses },
		changedFields: ["source_types", "target_type", "open_statuses"] });
	return result.rows[0];
}

async function localCandidates(codes) {
	const result = await db.query(
		`select distinct on (codigo_cliente, num_os) codigo_cliente, num_os, tipo,
		 to_char(data_cadastro at time zone 'UTC', 'YYYY-MM-DD') as day, updated_at
		 from ordens_servico where codigo_cliente = any($1::text[]) and coalesce(num_os, '') <> ''
		 order by codigo_cliente, num_os, updated_at desc`, [codes],
	);
	return result.rows;
}

async function queryDay(session, day, types, statuses) {
	const payload = await hubsoftSyncProfiles.automationRequest(session, "/api/v1/ordem_servico/consultar/paginado/1000?page=1", {
		method: "POST",
		body: {
			data_inicio: `${day}T00:00:00.000-03:00`, data_fim: `${day}T23:59:59.999-03:00`,
			tipo_data: "data_cadastro", status_ordem_servico: statuses,
			tipo_ordem_servicos: types, pagina: 1, itens_por_pagina: 1000,
		},
	});
	return rowsOf(payload);
}

async function search(input = {}, user = {}) {
	const configs = await getConfigs();
	if (!configs.length) {
		const error = new Error("Configure os tipos reais do HubSoft antes de pesquisar.");
		error.statusCode = 422;
		throw error;
	}
	const max = Math.max(...configs.map((item) => Number(item.batch_limit || 500)));
	const parsed = parseCodes(input.codes, max);
	if (!parsed.valid.length) {
		const error = new Error("Informe ao menos um código de cliente válido.");
		error.statusCode = 422;
		throw error;
	}
	const candidates = await localCandidates(parsed.valid);
	const days = [...new Set([...candidates.map((item) => item.day).filter(Boolean), saoPauloDay()])];
	const session = await hubsoftSyncProfiles.createAutomationSession();
	const metadata = await hubsoftSyncProfiles.automationRequest(session, "/api/v1/ordem_servico/create");
	const allTypeIds = new Set(configs.flatMap(configuredTypeIds).concat(configs.map((item) => Number(item.target_type?.id)).filter(Boolean)));
	const types = (metadata?.tipos_ordem_servico || []).filter((item) => allTypeIds.has(Number(item.id_tipo_ordem_servico || item.id)));
	const statuses = [...new Set(configs.flatMap((item) => item.open_statuses || []))];
	const found = [];
	for (const day of days) found.push(...await queryDay(session, day, types, statuses));
	const requested = new Set(parsed.valid);
	const results = found.filter((item) => requested.has(clientCode(item))).map((item) => {
		const config = configFor(configs, item);
		const targetId = Number(config?.target_type?.id || 0);
		const status = normalizeStatus(item.status_ordem_servico || item.status);
		const classification = classifyOrder(item, config);
		const already = classification === "ALREADY_CLASSIFIED";
		const eligible = classification === "ELIGIBLE";
		return {
			clientCode: clientCode(item), clientName: clientName(item), serviceOrderId: orderId(item), serviceOrderNumber: orderNumber(item),
			companyKey: company(item).key, companyName: company(item).name, sourceTypeId: typeId(item), sourceTypeName: typeName(item),
			status, targetTypeId: targetId || null, targetTypeName: clean(config?.target_type?.name || "Liberação de Portas"),
			eligibility: already ? "ALREADY_CLASSIFIED" : eligible ? "ELIGIBLE" : "REVIEW_REQUIRED",
			observation: already ? "Já classificada — nenhuma alteração necessária." : eligible ? "Ordem aberta e tipo de origem configurado." : "A configuração ou o estado atual exige análise.",
		};
	});
	const foundCodes = new Set(results.map((item) => item.clientCode));
	for (const code of parsed.valid) if (!foundCodes.has(code)) results.push({ clientCode: code, eligibility: "NOT_FOUND", observation: "Nenhuma ordem de cancelamento/retirada em aberto encontrada." });
	const owner = actor(user);
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("delete from service_order_port_release_searches where expires_at < now()");
		const searchRow = (await client.query(
			"insert into service_order_port_release_searches (requested_by, invalid_codes, duplicates) values ($1, $2::jsonb, $3) returning id",
			[owner.id, JSON.stringify(parsed.invalid), parsed.duplicates],
		)).rows[0];
		for (let index = 0; index < results.length; index += 1) {
			await client.query("insert into service_order_port_release_search_results (search_id, position, result) values ($1, $2, $3::jsonb)",
				[searchRow.id, index, JSON.stringify(results[index])]);
		}
		await client.query("commit");
		return getSearch(searchRow.id, input, user);
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally { client.release(); }
}

async function getSearch(id, input = {}, user = {}) {
	const owner = actor(user);
	const searchRow = (await db.query(
		"select * from service_order_port_release_searches where id=$1 and requested_by=$2 and expires_at > now()",
		[id, owner.id],
	)).rows[0];
	if (!searchRow) return null;
	const page = Math.max(Number(input.page || 1), 1);
	const limit = Math.min(Math.max(Number(input.limit || 50), 1), 200);
	const total = Number((await db.query("select count(*) from service_order_port_release_search_results where search_id=$1", [id])).rows[0].count);
	const rows = (await db.query(
		"select id, result from service_order_port_release_search_results where search_id=$1 order by position limit $2 offset $3",
		[id, limit, (page - 1) * limit],
	)).rows;
	return { searchId: id, items: rows.map((row) => ({ resultId: row.id, ...row.result })), invalidCodes: searchRow.invalid_codes,
		duplicates: searchRow.duplicates, pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } };
}

async function createBatch(input = {}, user = {}) {
	const orders = (Array.isArray(input.orders) ? input.orders : []).filter((item) => clean(item.eligibility) === "ELIGIBLE" && clean(item.serviceOrderId));
	if (!REASONS.has(clean(input.reason))) {
		const error = new Error("Selecione um motivo válido para a alteração.");
		error.statusCode = 422;
		throw error;
	}
	if (!orders.length) {
		const error = new Error("Selecione ao menos uma O.S elegível.");
		error.statusCode = 422;
		throw error;
	}
	const configs = await getConfigs();
	const max = Math.max(...configs.map((item) => Number(item.batch_limit || 0)), 0);
	if (!max || orders.length > max) {
		const error = new Error(`O lote excede o limite configurado de ${max || 0} ordens.`);
		error.statusCode = 422;
		throw error;
	}
	const owner = actor(user);
	const client = await db.connect();
	try {
		await client.query("begin");
		const batch = (await client.query(
			`insert into service_order_port_release_batches (total, reason, note, requested_by, requested_by_name)
			 values ($1, $2, $3, $4, $5) returning *`, [orders.length, clean(input.reason), clean(input.note), owner.id, owner.name],
		)).rows[0];
		for (const item of orders) {
			if (clean(item.eligibility) !== "ELIGIBLE" || !clean(item.serviceOrderId)) continue;
			const config = configs.find((row) => row.company_key === clean(item.companyKey)) || configs.find((row) => row.company_key === "DEFAULT");
			if (!config?.target_type?.id) throw Object.assign(new Error("Tipo de destino não configurado para uma das empresas."), { statusCode: 422 });
			await client.query(
				`insert into service_order_port_release_operations
				 (batch_id, client_code, client_name, service_order_id, service_order_number, company_key, company_name,
				 source_type_id, source_type_name, target_type_id, target_type_name, reason, note, requested_by, requested_by_name)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
				[batch.id, clean(item.clientCode), clean(item.clientName), clean(item.serviceOrderId), clean(item.serviceOrderNumber), clean(item.companyKey || "DEFAULT"), clean(item.companyName),
				 Number(item.sourceTypeId) || null, clean(item.sourceTypeName), Number(config.target_type.id), clean(config.target_type.name), clean(input.reason), clean(input.note), owner.id, owner.name],
			);
		}
		await client.query("commit");
		auditLog.recordAuditLog({ action: "create", module: "service_orders", entity: "port_release_batch", recordId: batch.id,
			userId: owner.id, userName: owner.name, beforeData: null, afterData: { total: orders.length, reason: clean(input.reason) }, changedFields: ["total", "reason"] });
		enqueue(batch.id);
		return batch;
	} catch (error) {
		await client.query("rollback");
		if (error.code === "23505") error.statusCode = 409;
		throw error;
	} finally {
		client.release();
	}
}

async function processOperation(row, session, configs, metadata) {
	await db.query("update service_order_port_release_operations set status = 'RUNNING', error_message = null where id = $1", [row.id]);
	try {
		let current = orderPayload(await hubsoftSyncProfiles.automationRequest(session, `/api/v1/ordem_servico/${encodeURIComponent(row.service_order_id)}`));
		if (!current) throw new Error("O HubSoft não retornou os dados completos da O.S.");
		if (clientCode(current) !== clean(row.client_code)) throw new Error("O código do cliente divergiu na confirmação da O.S.");
		const config = configFor(configs, current);
		const before = evidence(current);
		const targetId = Number(config?.target_type?.id || row.target_type_id);
		if (typeId(current) === targetId) return finishOperation(row.id, "SKIPPED", before, before, "A O.S já possui o tipo correto.");
		if (!config || !config.open_statuses.includes(normalizeStatus(current.status_ordem_servico || current.status)) || !configuredTypeIds(config).includes(typeId(current))) {
			return finishOperation(row.id, "SKIPPED", before, before, "A O.S deixou de ser elegível antes da alteração.");
		}
		const target = (metadata?.tipos_ordem_servico || []).find((item) => Number(item.id_tipo_ordem_servico || item.id) === targetId);
		if (!target) throw new Error("O tipo de destino configurado não está disponível no catálogo atual do HubSoft.");
		const updated = applyTargetType(current, target);
		let putError = null;
		try {
			await hubsoftSyncProfiles.automationRequest(session, `/api/v1/ordem_servico/${encodeURIComponent(row.service_order_id)}`, { method: "PUT", body: updated });
		} catch (error) {
			putError = error;
		}
		try {
			current = orderPayload(await hubsoftSyncProfiles.automationRequest(session, `/api/v1/ordem_servico/${encodeURIComponent(row.service_order_id)}`));
		} catch {
			return finishOperation(row.id, "INDETERMINATE", before, null, "Não foi possível confirmar o resultado no HubSoft.");
		}
		const after = evidence(current || {});
		if (typeId(current) === targetId) return finishOperation(row.id, "SUCCESS", before, after, "", orderId(current));
		if (putError) throw putError;
		return finishOperation(row.id, "ERROR", before, after, "O HubSoft respondeu, mas não confirmou a mudança do tipo.");
	} catch (error) {
		return finishOperation(row.id, "ERROR", null, null, clean(error.message || error));
	}
}

async function finishOperation(id, status, before, after, message = "", externalId = "") {
	const updated = await db.query(
		`update service_order_port_release_operations set status = $2, before_evidence = coalesce($3::jsonb, before_evidence),
		 after_evidence = $4::jsonb, error_message = nullif($5, ''), external_operation_id = nullif($6, ''),
		 confirmed_at = case when $2 in ('SUCCESS','SKIPPED') then now() else confirmed_at end where id = $1
		 returning requested_by, requested_by_name, service_order_id`,
		[id, status, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, message, externalId],
	);
	const operation = updated.rows[0];
	if (operation) auditLog.recordAuditLog({ action: "update", module: "service_orders", entity: "port_release_operation", recordId: id,
		userId: operation.requested_by, userName: operation.requested_by_name, beforeData: before, afterData: { ...after, result: status, error: message || undefined },
		changedFields: ["id_tipo_ordem_servico", "status"] });
}

async function runBatch(id) {
	await db.query("update service_order_port_release_batches set status = 'RUNNING', started_at = coalesce(started_at, now()) where id = $1", [id]);
	const configs = await getConfigs();
	const session = await hubsoftSyncProfiles.createAutomationSession();
	const metadata = await hubsoftSyncProfiles.automationRequest(session, "/api/v1/ordem_servico/create");
	const operations = (await db.query("select * from service_order_port_release_operations where batch_id = $1 and status = 'QUEUED' order by requested_at", [id])).rows;
	for (const operation of operations) await processOperation(operation, session, configs, metadata);
	const counts = (await db.query(
		`select count(*)::int processed, count(*) filter (where status='SUCCESS')::int succeeded,
		 count(*) filter (where status='SKIPPED')::int skipped, count(*) filter (where status='ERROR')::int failed,
		 count(*) filter (where status='INDETERMINATE')::int indeterminate from service_order_port_release_operations where batch_id=$1`, [id],
	)).rows[0];
	const final = counts.failed || counts.indeterminate ? (counts.succeeded || counts.skipped ? "PARTIAL" : "FAILED") : "COMPLETE";
	await db.query(`update service_order_port_release_batches set status=$2, processed=$3, succeeded=$4, skipped=$5, failed=$6, indeterminate=$7, completed_at=now() where id=$1`,
		[id, final, counts.processed, counts.succeeded, counts.skipped, counts.failed, counts.indeterminate]);
}

function enqueue(id) {
	if (queued.has(id)) return;
	queued.add(id);
	queue.push(id);
	scheduleDrain();
}

function scheduleDrain() {
	setImmediate(() => drain().catch((error) => console.error("[port-release] queue failed", { error: clean(error.message || error) })));
}

async function initialize() {
	if (initialized) return;
	initialized = true;
	try {
		const result = await db.query(
			`update service_order_port_release_batches set status='QUEUED'
			 where status='RUNNING' returning id`,
		);
		const queuedRows = await db.query("select id from service_order_port_release_batches where status='QUEUED' order by created_at");
		for (const row of [...result.rows, ...queuedRows.rows]) enqueue(row.id);
	} catch (error) {
		initialized = false;
		throw error;
	}
}

async function drain() {
	const configs = await getConfigs();
	const configured = Math.max(...configs.map((item) => Number(item.concurrency || 0)), 0);
	const concurrency = Math.min(Math.max(Number(process.env.PORT_RELEASE_WORKERS || configured || 2), 1), 5);
	while (workers < concurrency && queue.length) {
		const id = queue.shift();
		workers += 1;
		runBatch(id).catch(async (error) => {
			await db.query("update service_order_port_release_batches set status='FAILED', completed_at=now() where id=$1", [id]).catch(() => {});
			console.error("[port-release] batch failed", { batchId: id, error: clean(error.message || error) });
		}).finally(() => { queued.delete(id); workers -= 1; scheduleDrain(); });
	}
}

async function getBatch(id) {
	const batch = (await db.query("select * from service_order_port_release_batches where id=$1", [id])).rows[0];
	if (!batch) return null;
	const operations = (await db.query("select * from service_order_port_release_operations where batch_id=$1 order by requested_at", [id])).rows.map(publicOperation);
	return { ...batch, operations };
}

function historyWhere(query = {}) {
	const clauses = ["1=1"];
	const values = [];
	const add = (sql, value) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
	if (query.start_date) add("o.requested_at >= ?::date", query.start_date);
	if (query.end_date) add("o.requested_at < (?::date + interval '1 day')", query.end_date);
	if (query.company) add("o.company_key = ?", query.company);
	if (query.user) add("o.requested_by = ?", query.user);
	if (query.source_type) add("o.source_type_id = ?::bigint", query.source_type);
	if (query.reason) add("o.reason = ?", query.reason);
	if (query.status) add("o.status = ?", query.status);
	return { sql: clauses.join(" and "), values };
}

async function listHistory(query = {}) {
	const page = Math.max(Number(query.page || 1), 1);
	const limit = Math.min(Math.max(Number(query.limit || 25), 1), 200);
	const where = historyWhere(query);
	const count = Number((await db.query(`select count(*) from service_order_port_release_operations o where ${where.sql}`, where.values)).rows[0].count);
	const result = await db.query(`select o.* from service_order_port_release_operations o where ${where.sql} order by o.requested_at desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
		[...where.values, limit, (page - 1) * limit]);
	return { items: result.rows.map(publicOperation), pagination: { page, limit, total: count, totalPages: Math.max(Math.ceil(count / limit), 1) } };
}

async function stats(query = {}) {
	const where = historyWhere(query);
	const row = (await db.query(
		`select count(*) filter (where status='SUCCESS')::int total,
		 count(distinct client_code) filter (where status='SUCCESS')::int clients,
		 count(*) filter (where status='SUCCESS' and requested_at::date=(now() at time zone 'America/Sao_Paulo')::date)::int today,
		 count(*) filter (where status='SUCCESS' and date_trunc('month', requested_at at time zone 'America/Sao_Paulo')=date_trunc('month', now() at time zone 'America/Sao_Paulo'))::int month,
		 count(*) filter (where status in ('ERROR','INDETERMINATE'))::int failures
		 from service_order_port_release_operations o where ${where.sql}`, where.values,
	)).rows[0];
	const types = (await db.query(`select source_type_name name, count(*)::int total from service_order_port_release_operations o where ${where.sql} and status='SUCCESS' group by source_type_name order by total desc limit 5`, where.values)).rows;
	return { ...row, topSourceTypes: types };
}

async function exportRows(query = {}, format = "csv") {
	const where = historyWhere(query);
	const rows = (await db.query(`select client_code, client_name, service_order_number, company_name, source_type_name, target_type_name, requested_at, requested_by_name, reason, status from service_order_port_release_operations o where ${where.sql} order by requested_at desc limit 50000`, where.values)).rows;
	const headers = ["Código do cliente", "Cliente", "OS", "Empresa", "Tipo original", "Novo tipo", "Data", "Responsável", "Motivo", "Resultado"];
	const data = rows.map((row) => [row.client_code, row.client_name, row.service_order_number, row.company_name, row.source_type_name, row.target_type_name, row.requested_at, row.requested_by_name, row.reason, row.status]);
	if (format === "xlsx") {
		const XLSX = require("xlsx");
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...data]), "Liberações");
		return { content: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "liberacao-portas.xlsx" };
	}
	const quote = (value) => `"${clean(value).replace(/"/g, '""')}"`;
	return { content: `\ufeff${[headers, ...data].map((line) => line.map(quote).join(";")).join("\n")}`, contentType: "text/csv; charset=utf-8", filename: "liberacao-portas.csv" };
}

module.exports = { PERMISSIONS, REASONS: [...REASONS], catalog, createBatch, exportRows, getBatch, getConfigs, getSearch, initialize, listHistory, parseCodes, saveConfig, search, stats,
	__testables: { applyTargetType, classifyOrder, clientCode, company, evidence, normalizeStatus, orderId, processOperation, typeId } };
