const crypto = require("node:crypto");
const db = require("./db");

const COLLECTIONS = Object.freeze({
	appointments: "agendamentos",
	appointmentLogs: "agendamentos_logs",
	blocks: "agendamento_esteira_blocos",
	customers: "agendamento_esteira_clientes",
	customerIndex: "agendamento_esteira_cliente_index",
	esteiraLogs: "agendamento_esteira_logs",
	metrics: "agendamento_esteira_metricas",
	catalog: "agendamento_esteira_catalogo",
});

const COLLECTION_SET = new Set(Object.values(COLLECTIONS));

function isSchedulingCollection(collectionPath) {
	return COLLECTION_SET.has(String(collectionPath || "").trim());
}

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function intValue(value, fallback = 0) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "sim", "yes"].includes(normalized)) return true;
		if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
	}
	return null;
}

function timestampValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return timestampValue(value.value);
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampToIso(value) {
	const timestamp = timestampValue(value);
	return timestamp || "";
}

function dateValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return dateValue(value.value);
	const normalized = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function dateToYmd(value) {
	return dateValue(value) || "";
}

function timeValue(value) {
	const normalized = text(value);
	if (!normalized) return null;
	const match = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
	if (!match) return null;
	return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}

function hashPath(path) {
	return crypto.createHash("sha256").update(String(path)).digest("hex").slice(0, 32);
}

function collectionFromPath(documentPath) {
	const parts = String(documentPath || "")
		.split("/")
		.filter(Boolean);
	return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function documentIdFromPath(documentPath) {
	const parts = String(documentPath || "")
		.split("/")
		.filter(Boolean);
	return parts.at(-1) || "";
}

function normalizeLimit(value, fallback = 50) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
}

function normalizeOffset(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.trunc(parsed), 0);
}

function documentBase(collectionPath, row = {}, data = {}) {
	const documentId = row.legacy_document_id || row.document_id_original || row.id || row.mes || "";
	return {
		path: row.legacy_path || `${collectionPath}/${documentId}`,
		collectionPath,
		documentId,
		parentPath: null,
		data: { id: documentId, ...(row.source_payload || {}), ...data },
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at || row.atualizado_em || null,
	};
}

function mergeTimestampFields(data = {}, _row = {}, pairs = []) {
	const output = {};
	for (const [camel, snake, value] of pairs) {
		const normalized = timestampToIso(value);
		output[camel] = normalized;
		output[snake] = normalized;
	}
	return { ...data, ...output };
}

function mapBlock(row = {}) {
	return documentBase(
		COLLECTIONS.blocks,
		row,
		mergeTimestampFields(
			{
				filial_id: row.filial_id || "",
				empresa: row.empresa || "",
				cidade: row.cidade || "",
				regional: row.regional || "",
				nome: row.nome || "",
				tipo: row.tipo || "",
				status: row.status || "",
				atendente_id: row.atendente_id || "",
				atendente_nome: row.atendente_nome || "",
				arquivo: row.arquivo || "",
				total: Number(row.total || 0),
				pendentes: Number(row.pendentes || 0),
				agendados: Number(row.agendados || 0),
				retirados: Number(row.retirados || 0),
				multas: Number(row.multas || 0),
				lojas: Number(row.lojas || 0),
				clientes: row.clientes || [],
				criado_por_id: row.criado_por_id || "",
				criado_por_nome: row.criado_por_nome || "",
			},
			row,
			[
				["iniciadoEm", "iniciado_em", row.iniciado_em],
				["iniciadoEmLocal", "iniciado_em_local", row.iniciado_em_local],
				["finalizadoEm", "finalizado_em", row.finalizado_em],
				["criadoEm", "criado_em", row.criado_em || row.created_at],
				["atualizadoEm", "atualizado_em", row.atualizado_em || row.updated_at],
			],
		),
	);
}

function mapCustomer(row = {}) {
	return documentBase(
		COLLECTIONS.customers,
		row,
		mergeTimestampFields(
			{
				id: row.cliente_id_original || row.legacy_document_id || row.id,
				bloco_id: row.bloco_document_id_original || row.bloco_id || "",
				bloco_pk: row.bloco_id || "",
				codigo_cliente: row.codigo_cliente || "",
				nome: row.nome || "",
				cidade: row.cidade || "",
				regional: row.regional || "",
				filial_id: row.filial_id || "",
				empresa: row.empresa || "",
				status: row.status || "",
				ordem: row.ordem,
				telefones: row.telefones || [],
				tentativas: Number(row.tentativas || 0),
				agendamento_id: row.agendamento_id || "",
				origem_agendamento_id: row.origem_agendamento_id || "",
				reagendamento_numero: row.reagendamento_numero,
				motivo_nao_recolhimento: row.motivo_nao_recolhimento || "",
				data_retirada: row.data_retirada || "",
				equipamento_retirado: row.equipamento_retirado,
				retirado_por_id: row.retirado_por_id || "",
				retirado_por_nome: row.retirado_por_nome || "",
				entrega_loja: row.entrega_loja,
				entrega_loja_comentario: row.entrega_loja_comentario || "",
				entrega_loja_data: row.entrega_loja_data || "",
				entrega_loja_por_id: row.entrega_loja_por_id || "",
				entrega_loja_por_nome: row.entrega_loja_por_nome || "",
			},
			row,
			[
				["terminalAt", "terminal_at", row.terminal_at],
				["privacyExpiresAt", "privacy_expires_at", row.privacy_expires_at],
				[
					"entregaLojaRegistradaEmLocal",
					"entrega_loja_registrada_em_local",
					row.entrega_loja_registrada_em_local,
				],
				["criadoEm", "criado_em", row.criado_em || row.created_at],
				["atualizadoEm", "atualizado_em", row.atualizado_em || row.updated_at],
			],
		),
	);
}

function mapCustomerIndex(row = {}) {
	return documentBase(
		COLLECTIONS.customerIndex,
		row,
		mergeTimestampFields(
			{
				bloco_id: row.bloco_document_id_original || row.bloco_id || "",
				bloco_pk: row.bloco_id || "",
				codigo_cliente: row.codigo_cliente || "",
				filial_id: row.filial_id || "",
				status: row.status || "",
			},
			row,
			[
				["criadoEm", "criado_em", row.criado_em || row.created_at],
				["atualizadoEm", "atualizado_em", row.atualizado_em || row.updated_at],
			],
		),
	);
}

function mapAppointment(row = {}) {
	return documentBase(
		COLLECTIONS.appointments,
		row,
		mergeTimestampFields(
			{
				codigo_cliente: row.codigo_cliente || "",
				cliente_nome: row.cliente_nome || "",
				telefone: row.telefone || "",
				telefones: row.telefones || [],
				cidade: row.cidade || "",
				regional: row.regional || "",
				empresa: row.empresa || "",
				data: dateToYmd(row.data),
				hora: row.hora ? String(row.hora).slice(0, 5) : "",
				turno: row.turno || "",
				status: row.status || "",
				tecnico_nome: row.tecnico_nome || "",
				observacao: row.observacao || "",
				origem: row.origem || "",
				os: row.os || "",
				filial_id: row.filial_id || "",
				bloco_id: row.bloco_document_id_original || row.bloco_id || "",
				bloco_pk: row.bloco_id || "",
				atendente_id: row.atendente_id || "",
				atendente_nome: row.atendente_nome || "",
				usuario_id: row.usuario_id || "",
				usuario_nome: row.usuario_nome || "",
				criado_por_id: row.criado_por_id || "",
				criado_por_nome: row.criado_por_nome || "",
				agendado_por_id: row.agendado_por_id || "",
				agendado_por_nome: row.agendado_por_nome || "",
				atualizado_por_id: row.atualizado_por_id || "",
				atualizado_por_nome: row.atualizado_por_nome || "",
				motivo_recolhido: row.motivo_recolhido || "",
				motivo_nao_recolhido: row.motivo_nao_recolhido || "",
				equipamento_retirado: row.equipamento_retirado,
				motivo_nao_recolhimento: row.motivo_nao_recolhimento || "",
				bloco_reagendamento_id: row.bloco_reagendamento_id || "",
				reagendamento_numero: row.reagendamento_numero,
				enviado_reagendamento: row.enviado_reagendamento,
				mercado_compra_id: row.mercado_compra_id || "",
				mercado_compra_status: row.mercado_compra_status || "",
				mercado_empresa_id: row.mercado_empresa_id || "",
				mercado_empresa_nome: row.mercado_empresa_nome || "",
				verificacao_mapa: row.verificacao_mapa || null,
			},
			row,
			[
				["recolhidoEm", "recolhido_em", row.recolhido_em],
				["naoRecolhidoEm", "nao_recolhido_em", row.nao_recolhido_em],
				["desfechoEm", "desfecho_em", row.desfecho_em],
				["mercadoCompradoEm", "mercado_comprado_em", row.mercado_comprado_em],
				["criadoEm", "criado_em", row.criado_em || row.created_at],
				["atualizadoEm", "atualizado_em", row.atualizado_em || row.updated_at],
			],
		),
	);
}

function mapAppointmentLog(row = {}) {
	return documentBase(
		COLLECTIONS.appointmentLogs,
		row,
		{
			tipo: row.tipo || "",
			agendamento_id: row.agendamento_document_id_original || row.agendamento_id || "",
			agendamento_pk: row.agendamento_id || "",
			codigo_cliente: row.codigo_cliente || "",
			cliente_nome: row.cliente_nome || "",
			cidade: row.cidade || "",
			data_agendamento: dateToYmd(row.data_agendamento),
			hora: row.hora ? String(row.hora).slice(0, 5) : "",
			origem: row.origem || "",
			criterio: row.criterio || "",
			resultado: row.resultado || "",
			status_anterior: row.status_anterior || "",
			status_novo: row.status_novo || "",
			motivo: row.motivo || "",
			os_encontrada: row.os_encontrada || "",
			criado_em: timestampToIso(row.criado_em || row.created_at),
		},
	);
}

function mapEsteiraLog(row = {}) {
	return documentBase(COLLECTIONS.esteiraLogs, row, {
		tipo: row.tipo || "",
		filial_id: row.filial_id || "",
		request_id: row.request_id || "",
		usuario_id: row.usuario_id || "",
		usuario_nome: row.usuario_nome || "",
		usuario_role: row.usuario_role || "",
		arquivo: row.arquivo || "",
		bloco_id: row.bloco_document_id_original || row.bloco_id || "",
		cliente_id: row.cliente_document_id_original || row.cliente_id || "",
		agendamento_id: row.agendamento_document_id_original || row.agendamento_id || "",
		codigo_cliente: row.codigo_cliente || "",
		cliente_nome: row.cliente_nome || "",
		cidade: row.cidade || "",
		regional: row.regional || "",
		empresa: row.empresa || "",
		data: dateToYmd(row.data),
		hora: row.hora ? String(row.hora).slice(0, 5) : "",
		turno: row.turno || "",
		tentativa: row.tentativa,
		quantidade_blocos: row.quantidade_blocos,
		quantidade_clientes: row.quantidade_clientes,
		quantidade_ignorados: row.quantidade_ignorados,
		clientes_total: row.clientes_total,
		agendados: row.agendados,
		recolhidos: row.recolhidos,
		retirados: row.retirados,
		multas: row.multas,
		lojas: row.lojas,
		nao_recolhidos: row.nao_recolhidos,
		entregas_loja: row.entregas_loja,
		motivo: row.motivo || "",
		comentario: row.comentario || "",
		payload: row.payload || null,
		criado_em: timestampToIso(row.criado_em || row.created_at),
	});
}

function mapMetrics(row = {}) {
	return documentBase(COLLECTIONS.metrics, row, {
		mes: row.mes || row.legacy_document_id || "",
		agendamentos: Number(row.agendamentos || 0),
		recolhidos: Number(row.recolhidos || 0),
		recolhidos_diretos: Number(row.recolhidos_diretos || 0),
		nao_recolhidos: Number(row.nao_recolhidos || 0),
		tentativas: Number(row.tentativas || 0),
		multas: Number(row.multas || 0),
		entregas_loja: Number(row.entregas_loja || 0),
		cidades: row.cidades || {},
		usuarios: row.usuarios || {},
		agendamentos_por_cidade: row.agendamentos_por_cidade || {},
		agendamentos_por_usuario: row.agendamentos_por_usuario || {},
		recolhidos_por_cidade: row.recolhidos_por_cidade || {},
		tentativas_por_cidade: row.tentativas_por_cidade || {},
		tentativas_por_usuario: row.tentativas_por_usuario || {},
		multas_por_usuario: row.multas_por_usuario || {},
		nao_recolhidos_por_cidade: row.nao_recolhidos_por_cidade || {},
		entregas_loja_por_cidade: row.entregas_loja_por_cidade || {},
		entregas_loja_por_usuario: row.entregas_loja_por_usuario || {},
		atualizado_em: timestampToIso(row.atualizado_em || row.updated_at),
	});
}

function mapCatalog(row = {}) {
	return documentBase(COLLECTIONS.catalog, row, {
		blocos: row.blocos || [],
		atualizado_em: timestampToIso(row.atualizado_em || row.updated_at),
	});
}

function sourceData(record = {}) {
	return record.data || {};
}

function baseColumns(record = {}) {
	const data = sourceData(record);
	const now = new Date().toISOString();
	return {
		id:
			record.collectionPath === COLLECTIONS.metrics
				? nullableText(data.mes || record.documentId)
				: hashPath(record.path || `${record.collectionPath}/${record.documentId}`),
		document_id_original: nullableText(record.documentId),
		legacy_path: record.path || `${record.collectionPath}/${record.documentId}`,
		legacy_document_id: record.documentId,
		created_at:
			timestampValue(data.criado_em) ||
			timestampValue(data.criadoEm) ||
			timestampValue(record.importedAt) ||
			now,
		updated_at:
			timestampValue(data.atualizado_em) ||
			timestampValue(data.atualizadoEm) ||
			timestampValue(record.updatedAt) ||
			now,
		source_payload: data,
	};
}

function buildColumns(record, extractors) {
	const data = sourceData(record);
	const base = baseColumns(record);
	const columns = { ...base };
	for (const [column, extractor] of Object.entries(extractors)) {
		columns[column] = extractor(data, record, base);
	}
	return columns;
}

function rawJson(value) {
	return value === undefined ? null : value;
}

const CONFIG = Object.freeze({
	[COLLECTIONS.blocks]: {
		table: "agendamento_esteira_blocos",
		pk: "id",
		orderBy: "coalesce(criado_em, created_at) desc",
		mapper: mapBlock,
		extractors: {
			filial_id: (d) => nullableText(d.filial_id),
			empresa: (d) => nullableText(d.empresa),
			cidade: (d) => nullableText(d.cidade),
			regional: (d) => nullableText(d.regional),
			nome: (d) => nullableText(d.nome),
			tipo: (d) => nullableText(d.tipo),
			status: (d) => nullableText(d.status),
			atendente_id: (d) => nullableText(d.atendente_id),
			atendente_nome: (d) => nullableText(d.atendente_nome),
			arquivo: (d) => nullableText(d.arquivo),
			total: (d) => intValue(d.total),
			pendentes: (d) => intValue(d.pendentes),
			agendados: (d) => intValue(d.agendados),
			retirados: (d) => intValue(d.retirados),
			multas: (d) => intValue(d.multas),
			lojas: (d) => intValue(d.lojas),
			clientes: (d) => rawJson(Array.isArray(d.clientes) ? d.clientes : []),
			iniciado_em: (d) => timestampValue(d.iniciado_em),
			iniciado_em_local: (d) => timestampValue(d.iniciado_em_local),
			finalizado_em: (d) => timestampValue(d.finalizado_em),
			criado_por_id: (d) => nullableText(d.criado_por_id),
			criado_por_nome: (d) => nullableText(d.criado_por_nome),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
	[COLLECTIONS.customers]: {
		table: "agendamento_esteira_clientes",
		pk: "id",
		orderBy: "ordem nulls last, codigo_cliente",
		mapper: mapCustomer,
		extractors: {
			cliente_id_original: (d) => nullableText(d.id),
			bloco_document_id_original: (d) => nullableText(d.bloco_id),
			codigo_cliente: (d) => nullableText(d.codigo_cliente),
			nome: (d) => nullableText(d.nome || d.cliente_nome),
			cidade: (d) => nullableText(d.cidade),
			regional: (d) => nullableText(d.regional),
			filial_id: (d) => nullableText(d.filial_id),
			empresa: (d) => nullableText(d.empresa),
			status: (d) => nullableText(d.status),
			ordem: (d) => (d.ordem === undefined ? null : intValue(d.ordem)),
			telefones: (d) => rawJson(Array.isArray(d.telefones) ? d.telefones : []),
			tentativas: (d) => intValue(d.tentativas),
			terminal_at: (d) => timestampValue(d.terminal_at),
			privacy_expires_at: (d) => timestampValue(d.privacy_expires_at),
			agendamento_id: (d) => nullableText(d.agendamento_id),
			origem_agendamento_id: (d) => nullableText(d.origem_agendamento_id),
			reagendamento_numero: (d) =>
				d.reagendamento_numero === undefined ? null : intValue(d.reagendamento_numero),
			motivo_nao_recolhimento: (d) => nullableText(d.motivo_nao_recolhimento),
			data_retirada: (d) => dateValue(d.data_retirada),
			equipamento_retirado: (d) => boolValue(d.equipamento_retirado),
			retirado_por_id: (d) => nullableText(d.retirado_por_id),
			retirado_por_nome: (d) => nullableText(d.retirado_por_nome),
			entrega_loja: (d) => boolValue(d.entrega_loja),
			entrega_loja_comentario: (d) => nullableText(d.entrega_loja_comentario),
			entrega_loja_data: (d) => dateValue(d.entrega_loja_data),
			entrega_loja_por_id: (d) => nullableText(d.entrega_loja_por_id),
			entrega_loja_por_nome: (d) => nullableText(d.entrega_loja_por_nome),
			entrega_loja_registrada_em_local: (d) =>
				timestampValue(d.entrega_loja_registrada_em_local),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
	[COLLECTIONS.customerIndex]: {
		table: "agendamento_esteira_cliente_index",
		pk: "id",
		orderBy: "codigo_cliente",
		mapper: mapCustomerIndex,
		extractors: {
			bloco_document_id_original: (d) => nullableText(d.bloco_id),
			codigo_cliente: (d) => nullableText(d.codigo_cliente),
			filial_id: (d) => nullableText(d.filial_id),
			status: (d) => nullableText(d.status),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
	[COLLECTIONS.appointments]: {
		table: "agendamentos",
		pk: "id",
		orderBy: "data desc nulls last, hora desc nulls last, criado_em desc nulls last",
		mapper: mapAppointment,
		extractors: {
			codigo_cliente: (d) => nullableText(d.codigo_cliente),
			cliente_nome: (d) => nullableText(d.cliente_nome || d.nome_cliente || d.cliente),
			telefone: (d) => nullableText(d.telefone),
			telefones: (d) => rawJson(Array.isArray(d.telefones) ? d.telefones : []),
			cidade: (d) => nullableText(d.cidade),
			regional: (d) => nullableText(d.regional),
			empresa: (d) => nullableText(d.empresa),
			data: (d) => dateValue(d.data || d.data_agendamento),
			hora: (d) => timeValue(d.hora || d.horario),
			turno: (d) => nullableText(d.turno),
			status: (d) => nullableText(d.status),
			tecnico_nome: (d) => nullableText(d.tecnico_nome),
			observacao: (d) => nullableText(d.observacao),
			origem: (d) => nullableText(d.origem),
			os: (d) => nullableText(d.os),
			filial_id: (d) => nullableText(d.filial_id),
			bloco_document_id_original: (d) => nullableText(d.bloco_id),
			atendente_id: (d) => nullableText(d.atendente_id),
			atendente_nome: (d) => nullableText(d.atendente_nome),
			usuario_id: (d) => nullableText(d.usuario_id),
			usuario_nome: (d) => nullableText(d.usuario_nome),
			criado_por_id: (d) => nullableText(d.criado_por_id),
			criado_por_nome: (d) => nullableText(d.criado_por_nome),
			agendado_por_id: (d) => nullableText(d.agendado_por_id),
			agendado_por_nome: (d) => nullableText(d.agendado_por_nome),
			atualizado_por_id: (d) => nullableText(d.atualizado_por_id),
			atualizado_por_nome: (d) => nullableText(d.atualizado_por_nome),
			recolhido_em: (d) => timestampValue(d.recolhido_em),
			motivo_recolhido: (d) => nullableText(d.motivo_recolhido),
			nao_recolhido_em: (d) => timestampValue(d.nao_recolhido_em),
			motivo_nao_recolhido: (d) => nullableText(d.motivo_nao_recolhido),
			desfecho_em: (d) => timestampValue(d.desfecho_em),
			desfecho_por_id: (d) => nullableText(d.desfecho_por_id),
			desfecho_por_nome: (d) => nullableText(d.desfecho_por_nome),
			equipamento_retirado: (d) => boolValue(d.equipamento_retirado),
			motivo_nao_recolhimento: (d) => nullableText(d.motivo_nao_recolhimento),
			bloco_reagendamento_id: (d) => nullableText(d.bloco_reagendamento_id),
			reagendamento_numero: (d) =>
				d.reagendamento_numero === undefined ? null : intValue(d.reagendamento_numero),
			enviado_reagendamento: (d) => boolValue(d.enviado_reagendamento),
			mercado_compra_id: (d) => nullableText(d.mercado_compra_id),
			mercado_compra_status: (d) => nullableText(d.mercado_compra_status),
			mercado_comprado_em: (d) => timestampValue(d.mercado_comprado_em),
			mercado_empresa_id: (d) => nullableText(d.mercado_empresa_id),
			mercado_empresa_nome: (d) => nullableText(d.mercado_empresa_nome),
			verificacao_mapa: (d) => rawJson(d.verificacao_mapa || null),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
	[COLLECTIONS.appointmentLogs]: {
		table: "agendamentos_logs",
		pk: "id",
		orderBy: "criado_em desc nulls last",
		mapper: mapAppointmentLog,
		extractors: {
			tipo: (d) => nullableText(d.tipo),
			agendamento_document_id_original: (d) => nullableText(d.agendamento_id),
			codigo_cliente: (d) => nullableText(d.codigo_cliente),
			cliente_nome: (d) => nullableText(d.cliente_nome),
			cidade: (d) => nullableText(d.cidade),
			data_agendamento: (d) => dateValue(d.data_agendamento),
			hora: (d) => timeValue(d.hora),
			origem: (d) => nullableText(d.origem),
			criterio: (d) => nullableText(d.criterio),
			resultado: (d) => nullableText(d.resultado),
			status_anterior: (d) => nullableText(d.status_anterior),
			status_novo: (d) => nullableText(d.status_novo),
			motivo: (d) => nullableText(d.motivo),
			os_encontrada: (d) => nullableText(d.os_encontrada),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
		},
	},
	[COLLECTIONS.esteiraLogs]: {
		table: "agendamento_esteira_logs",
		pk: "id",
		orderBy: "criado_em desc nulls last",
		mapper: mapEsteiraLog,
		extractors: {
			tipo: (d) => nullableText(d.tipo),
			filial_id: (d) => nullableText(d.filial_id),
			request_id: (d) => nullableText(d.request_id),
			usuario_id: (d) => nullableText(d.usuario_id),
			usuario_nome: (d) => nullableText(d.usuario_nome),
			usuario_role: (d) => nullableText(d.usuario_role),
			arquivo: (d) => nullableText(d.arquivo),
			bloco_document_id_original: (d) => nullableText(d.bloco_id),
			cliente_document_id_original: (d) => nullableText(d.cliente_id),
			agendamento_document_id_original: (d) => nullableText(d.agendamento_id),
			codigo_cliente: (d) => nullableText(d.codigo_cliente),
			cliente_nome: (d) => nullableText(d.cliente_nome),
			cidade: (d) => nullableText(d.cidade),
			regional: (d) => nullableText(d.regional),
			empresa: (d) => nullableText(d.empresa),
			data: (d) => dateValue(d.data || d.data_retirada || d.data_entrega_loja),
			hora: (d) => timeValue(d.hora),
			turno: (d) => nullableText(d.turno),
			tentativa: (d) => (d.tentativa === undefined ? null : intValue(d.tentativa)),
			quantidade_blocos: (d) =>
				d.quantidade_blocos === undefined ? null : intValue(d.quantidade_blocos),
			quantidade_clientes: (d) =>
				d.quantidade_clientes === undefined
					? null
					: intValue(d.quantidade_clientes),
			quantidade_ignorados: (d) =>
				d.quantidade_ignorados === undefined
					? null
					: intValue(d.quantidade_ignorados),
			clientes_total: (d) =>
				d.clientes_total === undefined ? null : intValue(d.clientes_total),
			agendados: (d) => (d.agendados === undefined ? null : intValue(d.agendados)),
			recolhidos: (d) =>
				d.recolhidos === undefined ? null : intValue(d.recolhidos),
			retirados: (d) => (d.retirados === undefined ? null : intValue(d.retirados)),
			multas: (d) => (d.multas === undefined ? null : intValue(d.multas)),
			lojas: (d) => (d.lojas === undefined ? null : intValue(d.lojas)),
			nao_recolhidos: (d) =>
				d.nao_recolhidos === undefined ? null : intValue(d.nao_recolhidos),
			entregas_loja: (d) =>
				d.entregas_loja === undefined ? null : intValue(d.entregas_loja),
			motivo: (d) => nullableText(d.motivo),
			comentario: (d) => nullableText(d.comentario),
			payload: (d) => rawJson(d.payload || null),
			criado_em: (d, _r, b) => timestampValue(d.criado_em) || b.created_at,
		},
	},
	[COLLECTIONS.metrics]: {
		table: "agendamento_esteira_metricas",
		pk: "mes",
		orderBy: "mes desc",
		mapper: mapMetrics,
		extractors: {
			agendamentos: (d) => intValue(d.agendamentos),
			recolhidos: (d) => intValue(d.recolhidos),
			recolhidos_diretos: (d) => intValue(d.recolhidos_diretos),
			nao_recolhidos: (d) => intValue(d.nao_recolhidos),
			tentativas: (d) => intValue(d.tentativas),
			multas: (d) => intValue(d.multas),
			entregas_loja: (d) => intValue(d.entregas_loja),
			cidades: (d) => rawJson(d.cidades || {}),
			usuarios: (d) => rawJson(d.usuarios || {}),
			agendamentos_por_cidade: (d) => rawJson(d.agendamentos_por_cidade || {}),
			agendamentos_por_usuario: (d) => rawJson(d.agendamentos_por_usuario || {}),
			recolhidos_por_cidade: (d) => rawJson(d.recolhidos_por_cidade || {}),
			tentativas_por_cidade: (d) => rawJson(d.tentativas_por_cidade || {}),
			tentativas_por_usuario: (d) => rawJson(d.tentativas_por_usuario || {}),
			multas_por_usuario: (d) => rawJson(d.multas_por_usuario || {}),
			nao_recolhidos_por_cidade: (d) => rawJson(d.nao_recolhidos_por_cidade || {}),
			entregas_loja_por_cidade: (d) => rawJson(d.entregas_loja_por_cidade || {}),
			entregas_loja_por_usuario: (d) => rawJson(d.entregas_loja_por_usuario || {}),
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
	[COLLECTIONS.catalog]: {
		table: "agendamento_esteira_catalogo",
		pk: "id",
		orderBy: "id",
		mapper: mapCatalog,
		extractors: {
			blocos: (d) => rawJson(Array.isArray(d.blocos) ? d.blocos : []),
			atualizado_em: (d, _r, b) => timestampValue(d.atualizado_em) || b.updated_at,
		},
	},
});

function tableConfig(collectionPath) {
	const config = CONFIG[String(collectionPath || "").trim()];
	if (!config) {
		const error = new Error("Colecao de agendamentos nao mapeada.");
		error.statusCode = 400;
		throw error;
	}
	return config;
}

function sqlValue(value) {
	if (value && typeof value === "object" && !(value instanceof Date)) {
		return JSON.stringify(value);
	}
	return value;
}

async function listDocuments({ collectionPath, limit, offset } = {}) {
	const config = tableConfig(collectionPath);
	const result = await db.query(
		`select * from ${config.table} order by ${config.orderBy} limit $1 offset $2`,
		[normalizeLimit(limit), normalizeOffset(offset)],
	);
	return result.rows.map(config.mapper);
}

async function listAllDocuments(collectionPath) {
	const config = tableConfig(collectionPath);
	const result = await db.query(`select * from ${config.table} order by ${config.orderBy}`);
	return result.rows.map(config.mapper);
}

async function getDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const config = tableConfig(collectionPath);
	const documentId = documentIdFromPath(documentPath);
	const hashedId = hashPath(documentPath);
	const legacyPath = String(documentPath || "").trim();
	const byLegacyPath = await db.query(
		`select * from ${config.table} where legacy_path = $1 limit 1`,
		[legacyPath],
	);
	if (byLegacyPath.rows[0]) return config.mapper(byLegacyPath.rows[0]);

	const idCandidates = [...new Set([documentId, hashedId].filter(Boolean))];
	for (const candidate of idCandidates) {
		const byId = await db.query(
			`select * from ${config.table} where ${config.pk} = $1 limit 1`,
			[candidate],
		);
		if (byId.rows[0]) return config.mapper(byId.rows[0]);
	}

	return null;
}

async function upsertDocument(record = {}) {
	if (!isSchedulingCollection(record.collectionPath)) {
		const error = new Error("Colecao de agendamentos invalida.");
		error.statusCode = 400;
		throw error;
	}
	const config = tableConfig(record.collectionPath);
	const columns = buildColumns(record, config.extractors);
	if (record.collectionPath === COLLECTIONS.metrics) {
		columns.mes = nullableText(sourceData(record).mes || record.documentId) || columns.id;
		delete columns.id;
		delete columns.document_id_original;
	}
	const columnNames = Object.keys(columns);
	const placeholders = columnNames.map((_, index) => `$${index + 1}`);
	const updateColumns = columnNames.filter(
		(column) => !["id", "mes", "created_at"].includes(column),
	);
	await db.query(
		`insert into ${config.table} (${columnNames.join(", ")})
		 values (${placeholders.join(", ")})
		 on conflict (${config.pk}) do update set
		   ${updateColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
		columnNames.map((column) => sqlValue(columns[column])),
	);
	return getDocument(record.path || `${record.collectionPath}/${record.documentId}`);
}

async function deleteDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const config = tableConfig(collectionPath);
	const documentId = documentIdFromPath(documentPath);
	const hashedId = hashPath(documentPath);
	const legacyPath = String(documentPath || "").trim();
	const byLegacyPath = await db.query(
		`delete from ${config.table} where legacy_path = $1`,
		[legacyPath],
	);
	if (byLegacyPath.rowCount) return byLegacyPath.rowCount;

	const idCandidates = [...new Set([documentId, hashedId].filter(Boolean))];
	for (const candidate of idCandidates) {
		const byId = await db.query(
			`delete from ${config.table} where ${config.pk} = $1`,
			[candidate],
		);
		if (byId.rowCount) return byId.rowCount;
	}

	return 0;
}

async function deleteAppointmentLogsByType(type) {
	const result = await db.query("delete from agendamentos_logs where tipo = $1", [
		String(type || "").trim(),
	]);
	return result.rowCount || 0;
}

async function findClienteByCodigo(codigo) {
	const normalized = String(codigo || "").replace(/\D/g, "");
	if (!normalized) return null;
	const result = await db.query(
		`select *
		   from agendamentos
		  where document_id_original = $1
		     or codigo_cliente = $1
		  order by updated_at desc
		  limit 1`,
		[normalized],
	);
	return result.rows[0] ? mapAppointment(result.rows[0]) : null;
}

module.exports = {
	COLLECTIONS,
	deleteAppointmentLogsByType,
	deleteDocument,
	findClienteByCodigo,
	getDocument,
	isSchedulingCollection,
	listAllDocuments,
	listDocuments,
	upsertDocument,
};
