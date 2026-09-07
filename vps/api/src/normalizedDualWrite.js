const crypto = require("node:crypto");
const db = require("./db");

const MESSAGING_COLLECTIONS = new Set([
	"mensageria_fila",
	"mensageria_historico",
	"mensageria_callbacks",
	"mensageria_agendamento_conversas",
	"mensageria_templates",
	"mensageria_config",
]);

const RESPONSAVEL_TYPES = new Set([
	"lider",
	"supervisor",
	"backoffice",
	"delivery",
	"field_service",
]);

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function normalizeKey(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function bool(value, fallback = null) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "sim", "yes", "on"].includes(normalized)) return true;
		if (["false", "0", "nao", "não", "no", "off"].includes(normalized)) {
			return false;
		}
	}
	return fallback;
}

function intValue(value, fallback = 0) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return timestampValue(value.value);
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return dateValue(value.value);
	if (value instanceof Date) {
		return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
			2,
			"0",
		)}-${String(value.getUTCDate()).padStart(2, "0")}`;
	}
	const normalized = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const timestamp = timestampValue(normalized);
	return timestamp ? timestamp.slice(0, 10) : null;
}

function digits(value) {
	const normalized = text(value).replace(/\D/g, "");
	return normalized || null;
}

function hashId(value) {
	return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

// NOSONAR (javascript:S4790): SHA-1 aqui NAO protege segredo nenhum — gera
// um UUID v5-like DETERMINISTICO a partir de uma chave de negocio (cidade,
// responsavel), pra idempotencia de migracao/dual-write (mesmo seed -> mesmo
// id, evita duplicar registro ja existente). Trocar o algoritmo mudaria o id
// gerado pra registros que ja existem em producao (migration
// 030_regionais_usuarios_normalizacao.sql, ja aplicada), causando
// duplicidade em vez de atualizacao no proximo dual-write/migracao. NAO
// alterar sem migrar os ids existentes primeiro.
function stableUuid(seed) {
	const hash = crypto.createHash("sha1").update(String(seed)).digest();
	hash[6] = (hash[6] & 0x0f) | 0x50;
	hash[8] = (hash[8] & 0x3f) | 0x80;
	const hex = hash.subarray(0, 16).toString("hex");
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20, 32),
	].join("-");
}

function recordId(record = {}) {
	return (
		nullableText(record.data?.id) ||
		nullableText(record.documentId) ||
		hashId(record.path)
	);
}

function createdAt(record = {}) {
	return (
		timestampValue(record.data?.criadoEm) ||
		timestampValue(record.data?.criado_em) ||
		timestampValue(record.data?.createdAt) ||
		new Date().toISOString()
	);
}

function updatedAt(record = {}) {
	return (
		timestampValue(record.data?.atualizadoEm) ||
		timestampValue(record.data?.atualizado_em) ||
		timestampValue(record.data?.updatedAt) ||
		new Date().toISOString()
	);
}

function isMissingNormalizedSchema(error) {
	return error?.code === "42P01" || error?.code === "42703";
}

async function runDualWrite(label, operation) {
	try {
		await operation();
	} catch (error) {
		if (isMissingNormalizedSchema(error)) {
			console.warn(
				`[dual-write:${label}] schema normalizado ausente; legado mantido.`,
				error.message,
			);
			return;
		}
		console.error(`[dual-write:${label}] falha ao sincronizar tabela normalizada:`, error);
		throw error;
	}
}

function normalizeUserData(record = {}) {
	const data = record.data || {};
	const uid = text(record.documentId || data.uid || data.id || record.path?.split("/").pop());
	const email = text(data.email).toLowerCase();
	return {
		uid,
		email,
		displayName: nullableText(data.nome || data.displayName || data.display_name),
		role: nullableText(data.role),
		regional: nullableText(data.regional),
		disabled: bool(data.disabled || data.inativo, false),
		mustChangePassword: bool(data.trocar_senha || data.must_change_password, true),
		empresaId: nullableText(data.empresaId || data.empresa_id),
		empresaNome: nullableText(data.empresaNome || data.empresa_nome),
		insumosBaseId: nullableText(data.insumosBaseId || data.insumos_base_id),
		insumosBaseNome: nullableText(data.insumosBaseNome || data.insumos_base_nome),
		profile: data,
	};
}

async function upsertUser(record) {
	const user = normalizeUserData(record);
	if (!user.uid || !user.email) return;
	await db.query(
		`insert into app_users (
		   uid, email, display_name, role, regional, imported_profile, disabled,
		   must_change_password, empresa_id, empresa_nome, insumos_base_id, insumos_base_nome
		 )
		 values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
		 on conflict (uid) do update set
		   email = excluded.email,
		   display_name = excluded.display_name,
		   role = excluded.role,
		   regional = excluded.regional,
		   imported_profile = excluded.imported_profile,
		   disabled = excluded.disabled,
		   must_change_password = excluded.must_change_password,
		   empresa_id = excluded.empresa_id,
		   empresa_nome = excluded.empresa_nome,
		   insumos_base_id = excluded.insumos_base_id,
		   insumos_base_nome = excluded.insumos_base_nome`,
		[
			user.uid,
			user.email,
			user.displayName,
			user.role,
			user.regional,
			JSON.stringify(user.profile || {}),
			user.disabled,
			user.mustChangePassword,
			user.empresaId,
			user.empresaNome,
			user.insumosBaseId,
			user.insumosBaseNome,
		],
	);
}

function personRecord(record, regionalId, tipo, person, legacySuffix, extraPayload = {}) {
	const nome = nullableText(person?.nome || person?.name);
	const email = nullableText(person?.email);
	const telefone = nullableText(person?.telefone || person?.phone);
	if (!nome && !email && !telefone) return null;
	const identity = `${record.path}:responsavel:${tipo}:${legacySuffix}:${normalizeKey(
		email || nome || telefone,
	)}`;
	return {
		id: stableUuid(identity),
		regionalId,
		tipo,
		nome,
		email,
		telefone,
		legacyPath: `${record.path}/responsaveis/${legacySuffix}`,
		legacyDocumentId: legacySuffix,
		sourcePayload: { ...extraPayload, ...(person || {}) },
	};
}

function normalizeRegionalCidades(record, regionalId) {
	const data = record.data || {};
	const rawCidades = Array.isArray(data.cidades) ? data.cidades : [];
	const cidades = rawCidades
		.map((cidade, index) => ({
			id: stableUuid(`${record.path}:cidade:${normalizeKey(cidade?.nome || cidade)}`),
			regionalId,
			nome: text(cidade?.nome || cidade?.name || cidade),
			tipo: nullableText(cidade?.tipo || cidade?.type),
			legacyPath: `${record.path}/cidades/${index}`,
			legacyDocumentId: text(cidade?.nome || cidade),
			sourcePayload: cidade,
		}))
		.filter((cidade) => cidade.nome);
	if (!cidades.length && text(data.cidade)) {
		cidades.push({
			id: stableUuid(`${record.path}:cidade:${normalizeKey(data.cidade)}`),
			regionalId,
			nome: text(data.cidade),
			tipo: null,
			legacyPath: `${record.path}/cidades/0`,
			legacyDocumentId: text(data.cidade),
			sourcePayload: { nome: text(data.cidade), origem: "cidade" },
		});
	}
	return cidades;
}

function normalizeRegionalResponsaveis(record, regionalId) {
	const data = record.data || {};
	const responsaveis = [
		personRecord(record, regionalId, "lider", data.lider, "lider"),
		personRecord(record, regionalId, "supervisor", data.supervisor, "supervisor"),
		personRecord(record, regionalId, "backoffice", data.backoffice, "backoffice"),
	];
	(data.backoffices || []).forEach((person, index) => {
		responsaveis.push(
			personRecord(record, regionalId, "backoffice", person, `backoffices/${index}`),
		);
	});
	Object.entries(data.gruposOperacionais || {}).forEach(([groupKey, group]) => {
		if (!RESPONSAVEL_TYPES.has(groupKey)) return;
		responsaveis.push(
			personRecord(record, regionalId, groupKey, group?.lider, `${groupKey}/lider`, {
				papelOperacional: "lider",
			}),
		);
		responsaveis.push(
			personRecord(
				record,
				regionalId,
				groupKey,
				group?.supervisor,
				`${groupKey}/supervisor`,
				{ papelOperacional: "supervisor" },
			),
		);
		(group?.backoffices || []).forEach((person, index) => {
			responsaveis.push(
				personRecord(
					record,
					regionalId,
					groupKey,
					person,
					`${groupKey}/backoffices/${index}`,
					{ papelOperacional: "backoffice" },
				),
			);
		});
	});
	return responsaveis.filter(Boolean);
}

async function resolveRegionalId(record) {
	const data = record.data || {};
	const byLegacy = await db.query("select id from regionais where legacy_path = $1", [
		record.path,
	]);
	if (byLegacy.rows[0]?.id) return byLegacy.rows[0].id;

	const nome = text(data.nome || data.name || record.documentId);
	if (nome) {
		const byName = await db.query("select id from regionais where lower(nome) = lower($1)", [
			nome,
		]);
		if (byName.rows[0]?.id) return byName.rows[0].id;
	}
	return recordId(record);
}

async function upsertRegional(record) {
	const data = record.data || {};
	const id = await resolveRegionalId(record);
	const nome = text(data.nome || data.name || record.documentId || id);
	if (!id || !nome) return;
	const regional = await db.query(
		`insert into regionais
		 (id, nome, uf, ativo, legacy_path, legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
		 on conflict (id) do update set
		   nome = excluded.nome,
		   uf = excluded.uf,
		   ativo = excluded.ativo,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload
		 returning id`,
		[
			id,
			nome,
			nullableText(data.uf),
			data.ativo !== false,
			record.path,
			record.documentId,
			createdAt(record),
			updatedAt(record),
			JSON.stringify(data),
		],
	);
	const regionalId = regional.rows[0].id;
	await db.query("delete from regional_cidades where regional_id = $1", [regionalId]);
	await db.query("delete from regional_responsaveis where regional_id = $1", [
		regionalId,
	]);

	for (const cidade of normalizeRegionalCidades(record, regionalId)) {
		await db.query(
			`insert into regional_cidades
			 (id, regional_id, nome, tipo, legacy_path, legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
			 on conflict (regional_id, nome) do update set
			   tipo = excluded.tipo,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				cidade.id,
				cidade.regionalId,
				cidade.nome,
				cidade.tipo,
				cidade.legacyPath,
				cidade.legacyDocumentId,
				createdAt(record),
				updatedAt(record),
				JSON.stringify(cidade.sourcePayload || {}),
			],
		);
	}

	for (const responsavel of normalizeRegionalResponsaveis(record, regionalId)) {
		await db.query(
			`insert into regional_responsaveis
			 (id, regional_id, tipo, nome, email, telefone, legacy_path, legacy_document_id,
			  created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
			 on conflict (id) do update set
			   tipo = excluded.tipo,
			   nome = excluded.nome,
			   email = excluded.email,
			   telefone = excluded.telefone,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				responsavel.id,
				responsavel.regionalId,
				responsavel.tipo,
				responsavel.nome,
				responsavel.email,
				responsavel.telefone,
				responsavel.legacyPath,
				responsavel.legacyDocumentId,
				createdAt(record),
				updatedAt(record),
				JSON.stringify(responsavel.sourcePayload || {}),
			],
		);
	}
}

function normalizeMessagingBase(record) {
	return {
		id: recordId(record),
		legacyPath: record.path,
		legacyDocumentId: record.documentId,
		createdAt: createdAt(record),
		updatedAt: updatedAt(record),
		sourcePayload: record.data || {},
	};
}

async function existingTemplateId(templateId) {
	if (!templateId) return null;
	const result = await db.query("select id from mensageria_templates where id = $1", [
		templateId,
	]);
	return result.rows[0]?.id || null;
}

async function existingQueueId(filaId) {
	if (!filaId) return null;
	const result = await db.query("select id from mensageria_fila where id = $1", [filaId]);
	return result.rows[0]?.id || null;
}

async function upsertMessagingTemplate(record) {
	const data = record.data || {};
	const base = normalizeMessagingBase(record);
	await db.query(
		`insert into mensageria_templates
		 (id, nome, conteudo, situacao, required_central_button, legacy_path,
		  legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
		 on conflict (id) do update set
		   nome = excluded.nome,
		   conteudo = excluded.conteudo,
		   situacao = excluded.situacao,
		   required_central_button = excluded.required_central_button,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			base.id,
			nullableText(data.nome || data.name),
			nullableText(data.conteudo || data.content || data.mensagem),
			nullableText(data.situacao || data.status),
			bool(data.requiredCentralButton, false) === true,
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			base.updatedAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessagingQueue(record) {
	const data = record.data || {};
	const base = normalizeMessagingBase(record);
	const telefone = nullableText(data.telefone || data.phone);
	const templateId = await existingTemplateId(data.templateId || data.template_id);
	await db.query(
		`insert into mensageria_fila
		 (id, codigo_cliente, cliente, telefone, telefone_digits, os, contrato, cidade,
		  regional, endereco, status, template_id, origem, origem_tipo, status_os,
		  tentativas, ultimo_erro, ultimo_envio_em, prioridade_em, envio_lock_id,
		  envio_lock_em, criado_por, criado_em, atualizado_em, legacy_path,
		  legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)
		 on conflict (id) do update set
		   codigo_cliente = excluded.codigo_cliente,
		   cliente = excluded.cliente,
		   telefone = excluded.telefone,
		   telefone_digits = excluded.telefone_digits,
		   os = excluded.os,
		   contrato = excluded.contrato,
		   cidade = excluded.cidade,
		   regional = excluded.regional,
		   endereco = excluded.endereco,
		   status = excluded.status,
		   template_id = excluded.template_id,
		   origem = excluded.origem,
		   origem_tipo = excluded.origem_tipo,
		   status_os = excluded.status_os,
		   tentativas = excluded.tentativas,
		   ultimo_erro = excluded.ultimo_erro,
		   ultimo_envio_em = excluded.ultimo_envio_em,
		   prioridade_em = excluded.prioridade_em,
		   envio_lock_id = excluded.envio_lock_id,
		   envio_lock_em = excluded.envio_lock_em,
		   criado_por = excluded.criado_por,
		   criado_em = excluded.criado_em,
		   atualizado_em = excluded.atualizado_em,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			base.id,
			nullableText(data.codigo_cliente || data.codigoCliente),
			nullableText(data.cliente),
			telefone,
			nullableText(data.telefone_digits) || digits(telefone),
			nullableText(data.os),
			nullableText(data.contrato),
			nullableText(data.cidade),
			nullableText(data.regional),
			nullableText(data.endereco),
			nullableText(data.status),
			templateId,
			nullableText(data.origem),
			nullableText(data.origemTipo || data.origem_tipo),
			nullableText(data.statusOS || data.statusOs || data.status_os),
			intValue(data.tentativas, 0),
			nullableText(data.ultimoErro || data.ultimo_erro),
			timestampValue(data.ultimoEnvioEm || data.ultimo_envio_em),
			timestampValue(data.prioridadeEm || data.prioridade_em),
			nullableText(data.envioLockId || data.envio_lock_id),
			timestampValue(data.envioLockEm || data.envio_lock_em),
			nullableText(data.criadoPor || data.criado_por),
			timestampValue(data.criadoEm || data.criado_em) || base.createdAt,
			timestampValue(data.atualizadoEm || data.atualizado_em) || base.updatedAt,
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			base.updatedAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessagingHistory(record) {
	const data = record.data || {};
	const base = normalizeMessagingBase(record);
	const filaId = await existingQueueId(data.filaId || data.fila_id);
	await db.query(
		`insert into mensageria_historico
		 (id, fila_id, codigo_cliente, cliente, telefone, cidade, os, direction,
		  mensagem, provider, provider_status, status, erro, payload, criado_em,
		  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20::jsonb)
		 on conflict (id) do update set
		   fila_id = excluded.fila_id,
		   codigo_cliente = excluded.codigo_cliente,
		   cliente = excluded.cliente,
		   telefone = excluded.telefone,
		   cidade = excluded.cidade,
		   os = excluded.os,
		   direction = excluded.direction,
		   mensagem = excluded.mensagem,
		   provider = excluded.provider,
		   provider_status = excluded.provider_status,
		   status = excluded.status,
		   erro = excluded.erro,
		   payload = excluded.payload,
		   criado_em = excluded.criado_em,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			base.id,
			filaId,
			nullableText(data.codigo_cliente || data.codigoCliente),
			nullableText(data.cliente),
			nullableText(data.telefone),
			nullableText(data.cidade),
			nullableText(data.os),
			nullableText(data.direction || data.direcao),
			nullableText(data.mensagem || data.message),
			nullableText(data.provider || data.origem),
			nullableText(
				data.provider_status ||
					data.providerStatus ||
					data.evolutionResponse?.status ||
					data.evolutionResponse?.message,
			),
			nullableText(data.status),
			nullableText(data.erro || data.error),
			JSON.stringify(data.payload || data.evolutionResponse || null),
			timestampValue(data.criadoEm || data.criado_em) || base.createdAt,
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			base.updatedAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessagingCallback(record) {
	const data = record.data || {};
	const base = normalizeMessagingBase(record);
	await db.query(
		`insert into mensageria_callbacks
		 (id, agendamento_id, codigo_cliente, cliente, telefone, os, mensagem,
		  motivo, agendado, resposta_automatica, payload, recebido_em, criado_em,
		  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18::jsonb)
		 on conflict (id) do update set
		   agendamento_id = excluded.agendamento_id,
		   codigo_cliente = excluded.codigo_cliente,
		   cliente = excluded.cliente,
		   telefone = excluded.telefone,
		   os = excluded.os,
		   mensagem = excluded.mensagem,
		   motivo = excluded.motivo,
		   agendado = excluded.agendado,
		   resposta_automatica = excluded.resposta_automatica,
		   payload = excluded.payload,
		   recebido_em = excluded.recebido_em,
		   criado_em = excluded.criado_em,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			base.id,
			nullableText(data.agendamento_id || data.agendamentoId),
			nullableText(data.codigo_cliente || data.codigoCliente),
			nullableText(data.cliente),
			nullableText(data.telefone),
			nullableText(data.os),
			nullableText(data.mensagem || data.message),
			nullableText(data.motivo || data.status),
			bool(data.agendado),
			nullableText(data.resposta_automatica || data.respostaAutomatica),
			JSON.stringify(data.payload || data.schedule || null),
			timestampValue(data.recebido_em || data.recebidoEm) || base.createdAt,
			timestampValue(data.criado_em || data.criadoEm) || base.createdAt,
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			base.updatedAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessagingConversation(record) {
	const data = record.data || {};
	const item = data.item || {};
	const base = normalizeMessagingBase(record);
	const telefone = nullableText(data.telefone || item.telefone);
	await db.query(
		`insert into mensageria_agendamento_conversas
		 (id, telefone, telefone_digits, codigo_cliente, cliente, os, contrato, cidade,
		  regional, stage, agendamento_id, selected_date, selected_time, started_at,
		  completed_at, last_message_at, atualizado_em, item_payload, schedule_payload,
		  date_options, legacy_path, legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23,$24,$25::jsonb)
		 on conflict (id) do update set
		   telefone = excluded.telefone,
		   telefone_digits = excluded.telefone_digits,
		   codigo_cliente = excluded.codigo_cliente,
		   cliente = excluded.cliente,
		   os = excluded.os,
		   contrato = excluded.contrato,
		   cidade = excluded.cidade,
		   regional = excluded.regional,
		   stage = excluded.stage,
		   agendamento_id = excluded.agendamento_id,
		   selected_date = excluded.selected_date,
		   selected_time = excluded.selected_time,
		   started_at = excluded.started_at,
		   completed_at = excluded.completed_at,
		   last_message_at = excluded.last_message_at,
		   atualizado_em = excluded.atualizado_em,
		   item_payload = excluded.item_payload,
		   schedule_payload = excluded.schedule_payload,
		   date_options = excluded.date_options,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			base.id,
			telefone,
			digits(telefone),
			nullableText(item.codigo_cliente || item.codigoCliente),
			nullableText(item.cliente),
			nullableText(item.os),
			nullableText(item.contrato),
			nullableText(item.cidade),
			nullableText(item.regional),
			nullableText(data.stage),
			nullableText(data.agendamentoId || data.agendamento_id),
			dateValue(data.selectedDate),
			nullableText(data.selectedTime),
			timestampValue(data.startedAt),
			timestampValue(data.completedAt),
			timestampValue(data.lastMessageAt),
			timestampValue(data.atualizado_em || data.atualizadoEm),
			JSON.stringify(item || null),
			JSON.stringify(data.schedule || null),
			JSON.stringify(data.dateOptions || null),
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			base.updatedAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessagingConfig(record) {
	const base = normalizeMessagingBase(record);
	await db.query(
		`insert into mensageria_config
		 (id, data, updated_at, legacy_path, legacy_document_id, created_at, source_payload)
		 values ('global',$1::jsonb,$2,$3,$4,$5,$6::jsonb)
		 on conflict (id) do update set
		   data = excluded.data,
		   updated_at = excluded.updated_at,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   source_payload = excluded.source_payload`,
		[
			JSON.stringify(record.data || {}),
			base.updatedAt,
			base.legacyPath,
			base.legacyDocumentId,
			base.createdAt,
			JSON.stringify(base.sourcePayload),
		],
	);
}

async function upsertMessaging(record) {
	const handlers = {
		mensageria_templates: upsertMessagingTemplate,
		mensageria_fila: upsertMessagingQueue,
		mensageria_historico: upsertMessagingHistory,
		mensageria_callbacks: upsertMessagingCallback,
		mensageria_agendamento_conversas: upsertMessagingConversation,
		mensageria_config: upsertMessagingConfig,
	};
	await handlers[record.collectionPath]?.(record);
}

async function deleteNormalized(record = {}) {
	const collection = String(record.collectionPath || "").trim();
	if (collection === "usuarios") {
		await db.query("delete from app_users where uid = $1", [record.documentId]);
		return;
	}
	if (collection === "regionais") {
		await db.query("delete from regionais where legacy_path = $1 or id = $2", [
			record.path,
			record.documentId,
		]);
		return;
	}
	if (MESSAGING_COLLECTIONS.has(collection)) {
		await db.query(`delete from ${collection} where legacy_path = $1 or id = $2`, [
			record.path,
			collection === "mensageria_config" ? "global" : record.documentId,
		]);
	}
}

async function upsert(record = {}) {
	const collection = String(record.collectionPath || "").trim();
	if (collection === "usuarios") {
		await runDualWrite(collection, () => upsertUser(record));
		return;
	}
	if (collection === "regionais") {
		await runDualWrite(collection, () => upsertRegional(record));
		return;
	}
	if (MESSAGING_COLLECTIONS.has(collection)) {
		await runDualWrite(collection, () => upsertMessaging(record));
	}
}

async function remove(record = {}) {
	const collection = String(record.collectionPath || "").trim();
	if (
		collection === "usuarios" ||
		collection === "regionais" ||
		MESSAGING_COLLECTIONS.has(collection)
	) {
		await runDualWrite(collection, () => deleteNormalized(record));
	}
}

module.exports = {
	remove,
	upsert,
};
