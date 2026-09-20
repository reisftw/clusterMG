const crypto = require("node:crypto");
const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const writeJson = args.has("--json");

const COLLECTIONS = [
	"agendamento_esteira_blocos",
	"agendamento_esteira_clientes",
	"agendamento_esteira_cliente_index",
	"agendamentos",
	"agendamentos_logs",
	"agendamento_esteira_logs",
	"agendamento_esteira_metricas",
	"agendamento_esteira_catalogo",
];

const TARGET_TABLES = {
	agendamento_esteira_blocos: "agendamento_esteira_blocos",
	agendamento_esteira_clientes: "agendamento_esteira_clientes",
	agendamento_esteira_cliente_index: "agendamento_esteira_cliente_index",
	agendamentos: "agendamentos",
	agendamentos_logs: "agendamentos_logs",
	agendamento_esteira_logs: "agendamento_esteira_logs",
	agendamento_esteira_metricas: "agendamento_esteira_metricas",
	agendamento_esteira_catalogo: "agendamento_esteira_catalogo",
};

function buildPoolConfig() {
	if (process.env.DATABASE_URL) {
		return {
			connectionString: process.env.DATABASE_URL,
			ssl:
				process.env.PGSSLMODE === "require"
					? { rejectUnauthorized: false }
					: false,
		};
	}

	return {
		host: process.env.PGHOST || "127.0.0.1",
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER || "retorninho",
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE || "retiradas",
		ssl:
			process.env.PGSSLMODE === "require"
				? { rejectUnauthorized: false }
				: false,
	};
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
	if (typeof value === "object" && value.seconds) {
		return new Date(Number(value.seconds) * 1000).toISOString();
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return dateValue(value.value);
	const normalized = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
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

function base(row) {
	const data = row.data || {};
	const createdAt =
		timestampValue(data.criado_em) ||
		timestampValue(data.criadoEm) ||
		timestampValue(data.createdAt) ||
		timestampValue(row.imported_at) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizado_em) ||
		timestampValue(data.atualizadoEm) ||
		timestampValue(data.updatedAt) ||
		timestampValue(row.updated_at) ||
		createdAt;
	return {
		id: hashPath(row.path),
		documentIdOriginal: nullableText(row.document_id),
		legacyPath: row.path,
		legacyDocumentId: row.document_id,
		createdAt,
		updatedAt,
		sourcePayload: data,
	};
}

function buildAliasMap(rows, idSelector) {
	const aliases = new Map();
	for (const row of rows) {
		const data = row.sourcePayload || {};
		const targetId = idSelector(row);
		[
			row.legacyDocumentId,
			row.documentIdOriginal,
			row.legacyPath,
			data.id,
			data.bloco_id,
			data.agendamento_id,
		]
			.map(nullableText)
			.filter(Boolean)
			.forEach((alias) => {
				if (!aliases.has(alias)) aliases.set(alias, targetId);
			});
	}
	return aliases;
}

function normalizeBlock(row) {
	const data = row.data || {};
	const normalized = base(row);
	return {
		...normalized,
		filialId: nullableText(data.filial_id),
		empresa: nullableText(data.empresa),
		cidade: nullableText(data.cidade),
		regional: nullableText(data.regional),
		nome: nullableText(data.nome),
		tipo: nullableText(data.tipo),
		status: nullableText(data.status),
		atendenteId: nullableText(data.atendente_id),
		atendenteNome: nullableText(data.atendente_nome),
		arquivo: nullableText(data.arquivo),
		total: intValue(data.total),
		pendentes: intValue(data.pendentes),
		agendados: intValue(data.agendados),
		retirados: intValue(data.retirados),
		multas: intValue(data.multas),
		lojas: intValue(data.lojas),
		clientes: Array.isArray(data.clientes) ? data.clientes : null,
		iniciadoEm: timestampValue(data.iniciado_em),
		iniciadoEmLocal: timestampValue(data.iniciado_em_local),
		finalizadoEm: timestampValue(data.finalizado_em),
		criadoPorId: nullableText(data.criado_por_id),
		criadoPorNome: nullableText(data.criado_por_nome),
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

function normalizeCustomer(row, blockAliases) {
	const data = row.data || {};
	const normalized = base(row);
	const blocoOriginal = nullableText(data.bloco_id);
	return {
		...normalized,
		clienteIdOriginal: nullableText(data.id),
		blocoId: blocoOriginal ? blockAliases.get(blocoOriginal) || null : null,
		blocoDocumentIdOriginal: blocoOriginal,
		codigoCliente: nullableText(data.codigo_cliente),
		nome: nullableText(data.nome || data.cliente_nome),
		cidade: nullableText(data.cidade),
		regional: nullableText(data.regional),
		filialId: nullableText(data.filial_id),
		empresa: nullableText(data.empresa),
		status: nullableText(data.status),
		ordem: data.ordem === undefined ? null : intValue(data.ordem),
		telefones: Array.isArray(data.telefones) ? data.telefones : null,
		tentativas: intValue(data.tentativas),
		terminalAt: timestampValue(data.terminal_at),
		privacyExpiresAt: timestampValue(data.privacy_expires_at),
		agendamentoId: nullableText(data.agendamento_id),
		origemAgendamentoId: nullableText(data.origem_agendamento_id),
		reagendamentoNumero:
			data.reagendamento_numero === undefined
				? null
				: intValue(data.reagendamento_numero),
		motivoNaoRecolhimento: nullableText(data.motivo_nao_recolhimento),
		dataRetirada: dateValue(data.data_retirada),
		equipamentoRetirado: boolValue(data.equipamento_retirado),
		retiradoPorId: nullableText(data.retirado_por_id),
		retiradoPorNome: nullableText(data.retirado_por_nome),
		entregaLoja: boolValue(data.entrega_loja),
		entregaLojaComentario: nullableText(data.entrega_loja_comentario),
		entregaLojaData: dateValue(data.entrega_loja_data),
		entregaLojaPorId: nullableText(data.entrega_loja_por_id),
		entregaLojaPorNome: nullableText(data.entrega_loja_por_nome),
		entregaLojaRegistradaEmLocal: timestampValue(
			data.entrega_loja_registrada_em_local,
		),
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

function normalizeCustomerIndex(row, blockAliases) {
	const data = row.data || {};
	const normalized = base(row);
	const blocoOriginal = nullableText(data.bloco_id);
	return {
		...normalized,
		blocoId: blocoOriginal ? blockAliases.get(blocoOriginal) || null : null,
		blocoDocumentIdOriginal: blocoOriginal,
		codigoCliente: nullableText(data.codigo_cliente),
		filialId: nullableText(data.filial_id),
		status: nullableText(data.status),
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

function normalizeAppointment(row, blockAliases) {
	const data = row.data || {};
	const normalized = base(row);
	const blocoOriginal = nullableText(data.bloco_id);
	return {
		...normalized,
		codigoCliente: nullableText(data.codigo_cliente),
		clienteNome: nullableText(data.cliente_nome || data.nome_cliente || data.cliente),
		telefone: nullableText(data.telefone),
		telefones: Array.isArray(data.telefones) ? data.telefones : null,
		cidade: nullableText(data.cidade),
		regional: nullableText(data.regional),
		empresa: nullableText(data.empresa),
		data: dateValue(data.data || data.data_agendamento),
		hora: timeValue(data.hora || data.horario),
		turno: nullableText(data.turno),
		status: nullableText(data.status),
		tecnicoNome: nullableText(data.tecnico_nome),
		observacao: nullableText(data.observacao),
		origem: nullableText(data.origem),
		os: nullableText(data.os),
		filialId: nullableText(data.filial_id),
		blocoId: blocoOriginal ? blockAliases.get(blocoOriginal) || null : null,
		blocoDocumentIdOriginal: blocoOriginal,
		atendenteId: nullableText(data.atendente_id),
		atendenteNome: nullableText(data.atendente_nome),
		usuarioId: nullableText(data.usuario_id),
		usuarioNome: nullableText(data.usuario_nome),
		criadoPorId: nullableText(data.criado_por_id),
		criadoPorNome: nullableText(data.criado_por_nome),
		agendadoPorId: nullableText(data.agendado_por_id),
		agendadoPorNome: nullableText(data.agendado_por_nome),
		atualizadoPorId: nullableText(data.atualizado_por_id),
		atualizadoPorNome: nullableText(data.atualizado_por_nome),
		recolhidoEm: timestampValue(data.recolhido_em),
		motivoRecolhido: nullableText(data.motivo_recolhido),
		naoRecolhidoEm: timestampValue(data.nao_recolhido_em),
		motivoNaoRecolhido: nullableText(data.motivo_nao_recolhido),
		desfechoEm: timestampValue(data.desfecho_em),
		desfechoPorId: nullableText(data.desfecho_por_id),
		desfechoPorNome: nullableText(data.desfecho_por_nome),
		equipamentoRetirado: boolValue(data.equipamento_retirado),
		motivoNaoRecolhimento: nullableText(data.motivo_nao_recolhimento),
		blocoReagendamentoId: nullableText(data.bloco_reagendamento_id),
		reagendamentoNumero:
			data.reagendamento_numero === undefined
				? null
				: intValue(data.reagendamento_numero),
		enviadoReagendamento: boolValue(data.enviado_reagendamento),
		mercadoCompraId: nullableText(data.mercado_compra_id),
		mercadoCompraStatus: nullableText(data.mercado_compra_status),
		mercadoCompradoEm: timestampValue(data.mercado_comprado_em),
		mercadoEmpresaId: nullableText(data.mercado_empresa_id),
		mercadoEmpresaNome: nullableText(data.mercado_empresa_nome),
		verificacaoMapa: data.verificacao_mapa || null,
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

function normalizeAppointmentLog(row, appointmentAliases) {
	const data = row.data || {};
	const normalized = base(row);
	const appointmentOriginal = nullableText(data.agendamento_id);
	return {
		...normalized,
		tipo: nullableText(data.tipo),
		agendamentoId: appointmentOriginal
			? appointmentAliases.get(appointmentOriginal) || null
			: null,
		agendamentoDocumentIdOriginal: appointmentOriginal,
		codigoCliente: nullableText(data.codigo_cliente),
		clienteNome: nullableText(data.cliente_nome),
		cidade: nullableText(data.cidade),
		dataAgendamento: dateValue(data.data_agendamento),
		hora: timeValue(data.hora),
		origem: nullableText(data.origem),
		criterio: nullableText(data.criterio),
		resultado: nullableText(data.resultado),
		statusAnterior: nullableText(data.status_anterior),
		statusNovo: nullableText(data.status_novo),
		motivo: nullableText(data.motivo),
		osEncontrada: nullableText(data.os_encontrada),
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
	};
}

function normalizeEsteiraLog(row, aliases) {
	const data = row.data || {};
	const normalized = base(row);
	const blocoOriginal = nullableText(data.bloco_id || data.bloco_reagendamento_id);
	const clienteOriginal = nullableText(data.cliente_id);
	const appointmentOriginal = nullableText(data.agendamento_id);
	return {
		...normalized,
		tipo: nullableText(data.tipo),
		filialId: nullableText(data.filial_id),
		requestId: nullableText(data.request_id),
		usuarioId: nullableText(data.usuario_id),
		usuarioNome: nullableText(data.usuario_nome),
		usuarioRole: nullableText(data.usuario_role),
		arquivo: nullableText(data.arquivo),
		blocoId: blocoOriginal ? aliases.blocks.get(blocoOriginal) || null : null,
		blocoDocumentIdOriginal: blocoOriginal,
		clienteId: clienteOriginal ? aliases.customers.get(clienteOriginal) || null : null,
		clienteDocumentIdOriginal: clienteOriginal,
		agendamentoId: appointmentOriginal
			? aliases.appointments.get(appointmentOriginal) || null
			: null,
		agendamentoDocumentIdOriginal: appointmentOriginal,
		codigoCliente: nullableText(data.codigo_cliente),
		clienteNome: nullableText(data.cliente_nome),
		cidade: nullableText(data.cidade),
		regional: nullableText(data.regional),
		empresa: nullableText(data.empresa),
		data: dateValue(data.data || data.data_retirada || data.data_entrega_loja),
		hora: timeValue(data.hora),
		turno: nullableText(data.turno),
		tentativa: data.tentativa === undefined ? null : intValue(data.tentativa),
		quantidadeBlocos:
			data.quantidade_blocos === undefined ? null : intValue(data.quantidade_blocos),
		quantidadeClientes:
			data.quantidade_clientes === undefined
				? null
				: intValue(data.quantidade_clientes),
		quantidadeIgnorados:
			data.quantidade_ignorados === undefined
				? null
				: intValue(data.quantidade_ignorados),
		clientesTotal:
			data.clientes_total === undefined ? null : intValue(data.clientes_total),
		agendados: data.agendados === undefined ? null : intValue(data.agendados),
		recolhidos: data.recolhidos === undefined ? null : intValue(data.recolhidos),
		retirados: data.retirados === undefined ? null : intValue(data.retirados),
		multas: data.multas === undefined ? null : intValue(data.multas),
		lojas: data.lojas === undefined ? null : intValue(data.lojas),
		naoRecolhidos:
			data.nao_recolhidos === undefined ? null : intValue(data.nao_recolhidos),
		entregasLoja:
			data.entregas_loja === undefined ? null : intValue(data.entregas_loja),
		motivo: nullableText(data.motivo),
		comentario: nullableText(data.comentario),
		payload: data.payload || null,
		criadoEm: timestampValue(data.criado_em) || normalized.createdAt,
	};
}

function normalizeMetrics(row) {
	const data = row.data || {};
	const normalized = base(row);
	return {
		...normalized,
		mes: nullableText(data.mes || row.document_id) || normalized.id,
		agendamentos: intValue(data.agendamentos),
		recolhidos: intValue(data.recolhidos),
		recolhidosDiretos: intValue(data.recolhidos_diretos),
		naoRecolhidos: intValue(data.nao_recolhidos),
		tentativas: intValue(data.tentativas),
		multas: intValue(data.multas),
		entregasLoja: intValue(data.entregas_loja),
		cidades: data.cidades || null,
		usuarios: data.usuarios || null,
		agendamentosPorCidade: data.agendamentos_por_cidade || null,
		agendamentosPorUsuario: data.agendamentos_por_usuario || null,
		recolhidosPorCidade: data.recolhidos_por_cidade || null,
		tentativasPorCidade: data.tentativas_por_cidade || null,
		tentativasPorUsuario: data.tentativas_por_usuario || null,
		multasPorUsuario: data.multas_por_usuario || null,
		naoRecolhidosPorCidade: data.nao_recolhidos_por_cidade || null,
		entregasLojaPorCidade: data.entregas_loja_por_cidade || null,
		entregasLojaPorUsuario: data.entregas_loja_por_usuario || null,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

function normalizeCatalog(row) {
	const data = row.data || {};
	const normalized = base(row);
	return {
		...normalized,
		blocos: Array.isArray(data.blocos) ? data.blocos : null,
		atualizadoEm: timestampValue(data.atualizado_em) || normalized.updatedAt,
	};
}

async function loadCollection(client, collectionPath) {
	const result = await client.query(
		`select path, collection_path, document_id, data, imported_at, updated_at
		   from app_documents
		  where collection_path = $1
		  order by path`,
		[collectionPath],
	);
	return result.rows;
}

async function loadNormalized(client) {
	const raw = {};
	for (const collection of COLLECTIONS) {
		raw[collection] = await loadCollection(client, collection);
	}

	const blocks = raw.agendamento_esteira_blocos.map(normalizeBlock);
	const blockAliases = buildAliasMap(blocks, (row) => row.id);
	const customers = raw.agendamento_esteira_clientes.map((row) =>
		normalizeCustomer(row, blockAliases),
	);
	const customerAliases = buildAliasMap(customers, (row) => row.id);
	const customerIndex = raw.agendamento_esteira_cliente_index.map((row) =>
		normalizeCustomerIndex(row, blockAliases),
	);
	const appointments = raw.agendamentos.map((row) =>
		normalizeAppointment(row, blockAliases),
	);
	const appointmentAliases = buildAliasMap(appointments, (row) => row.id);
	const aliases = {
		blocks: blockAliases,
		customers: customerAliases,
		appointments: appointmentAliases,
	};

	return {
		agendamento_esteira_blocos: blocks,
		agendamento_esteira_clientes: customers,
		agendamento_esteira_cliente_index: customerIndex,
		agendamentos: appointments,
		agendamentos_logs: raw.agendamentos_logs.map((row) =>
			normalizeAppointmentLog(row, appointmentAliases),
		),
		agendamento_esteira_logs: raw.agendamento_esteira_logs.map((row) =>
			normalizeEsteiraLog(row, aliases),
		),
		agendamento_esteira_metricas: raw.agendamento_esteira_metricas.map(
			normalizeMetrics,
		),
		agendamento_esteira_catalogo:
			raw.agendamento_esteira_catalogo.map(normalizeCatalog),
	};
}

async function sourceCounts(client) {
	const result = await client.query(
		`select collection_path, count(*)::int as rows, count(distinct path)::int as distinct_legacy_paths,
		        count(distinct document_id)::int as distinct_document_ids
		   from app_documents
		  where collection_path = any($1)
		  group by collection_path
		  order by collection_path`,
		[COLLECTIONS],
	);
	return Object.fromEntries(result.rows.map((row) => [row.collection_path, row]));
}

async function targetStats(client) {
	const stats = {};
	for (const [collection, table] of Object.entries(TARGET_TABLES)) {
		const exists = await client.query("select to_regclass($1) as name", [
			`public.${table}`,
		]);
		if (!exists.rows[0]?.name) {
			stats[collection] = { exists: false, rows: 0, distinctLegacyPaths: 0 };
			continue;
		}
		const result = await client.query(
			`select count(*)::int as rows, count(distinct legacy_path)::int as "distinctLegacyPaths" from ${table}`,
		);
		stats[collection] = { exists: true, ...result.rows[0] };
	}
	return stats;
}

function statusCounts(normalizedByCollection) {
	const counts = {};
	for (const [collection, rows] of Object.entries(normalizedByCollection)) {
		counts[collection] = rows.reduce((acc, row) => {
			const status = row.status || row.tipo || row.mes || "sem_status";
			acc[status] = (acc[status] || 0) + 1;
			return acc;
		}, {});
	}
	return counts;
}

function monthCounts(normalizedByCollection) {
	const counts = {};
	for (const [collection, rows] of Object.entries(normalizedByCollection)) {
		counts[collection] = rows.reduce((acc, row) => {
			const month = text(row.data || row.criadoEm || row.atualizadoEm || row.mes).slice(
				0,
				7,
			);
			const key = /^\d{4}-\d{2}$/.test(month) ? month : "sem_mes";
			acc[key] = (acc[key] || 0) + 1;
			return acc;
		}, {});
	}
	return counts;
}

async function referenceReport(normalized) {
	return {
		clientesSemBloco: normalized.agendamento_esteira_clientes.filter(
			(row) => row.blocoDocumentIdOriginal && !row.blocoId,
		).length,
		indicesSemBloco: normalized.agendamento_esteira_cliente_index.filter(
			(row) => row.blocoDocumentIdOriginal && !row.blocoId,
		).length,
		agendamentosSemBloco: normalized.agendamentos.filter(
			(row) => row.blocoDocumentIdOriginal && !row.blocoId,
		).length,
		logsEsteiraSemBloco: normalized.agendamento_esteira_logs.filter(
			(row) => row.blocoDocumentIdOriginal && !row.blocoId,
		).length,
		logsEsteiraSemCliente: normalized.agendamento_esteira_logs.filter(
			(row) => row.clienteDocumentIdOriginal && !row.clienteId,
		).length,
		logsEsteiraSemAgendamento: normalized.agendamento_esteira_logs.filter(
			(row) => row.agendamentoDocumentIdOriginal && !row.agendamentoId,
		).length,
		logsAgendamentoSemAgendamento: normalized.agendamentos_logs.filter(
			(row) => row.agendamentoDocumentIdOriginal && !row.agendamentoId,
		).length,
	};
}

async function buildReport(client, normalized) {
	return {
		mode: apply ? "apply" : "dry-run",
		sourceCounts: await sourceCounts(client),
		targetStats: await targetStats(client),
		normalizedCounts: Object.fromEntries(
			Object.entries(normalized).map(([collection, rows]) => [
				collection,
				rows.length,
			]),
		),
		statusCounts: statusCounts(normalized),
		monthCounts: monthCounts(normalized),
		references: await referenceReport(normalized),
		samplesByCollection: Object.fromEntries(
			Object.entries(normalized).map(([collection, rows]) => [
				collection,
				rows.slice(0, 5).map((row) => ({
					id: row.id || row.mes,
					legacyPath: row.legacyPath,
					legacyDocumentId: row.legacyDocumentId,
					status: row.status || row.tipo || row.mes || "",
					codigoCliente: row.codigoCliente || "",
					clienteNome: row.clienteNome || row.nome || "",
					cidade: row.cidade || "",
					data: row.data || "",
					criadoEm: row.criadoEm || "",
				})),
			]),
		),
	};
}

async function upsertBlocks(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_blocos
			 (id, document_id_original, filial_id, empresa, cidade, regional, nome, tipo, status,
			  atendente_id, atendente_nome, arquivo, total, pendentes, agendados, retirados,
			  multas, lojas, clientes, iniciado_em, iniciado_em_local, finalizado_em,
			  criado_por_id, criado_por_nome, criado_em, atualizado_em, legacy_path,
			  legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb)
			 on conflict (id) do update set
			   document_id_original = excluded.document_id_original,
			   filial_id = excluded.filial_id,
			   empresa = excluded.empresa,
			   cidade = excluded.cidade,
			   regional = excluded.regional,
			   nome = excluded.nome,
			   tipo = excluded.tipo,
			   status = excluded.status,
			   atendente_id = excluded.atendente_id,
			   atendente_nome = excluded.atendente_nome,
			   arquivo = excluded.arquivo,
			   total = excluded.total,
			   pendentes = excluded.pendentes,
			   agendados = excluded.agendados,
			   retirados = excluded.retirados,
			   multas = excluded.multas,
			   lojas = excluded.lojas,
			   clientes = excluded.clientes,
			   iniciado_em = excluded.iniciado_em,
			   iniciado_em_local = excluded.iniciado_em_local,
			   finalizado_em = excluded.finalizado_em,
			   criado_por_id = excluded.criado_por_id,
			   criado_por_nome = excluded.criado_por_nome,
			   criado_em = excluded.criado_em,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.filialId,
				row.empresa,
				row.cidade,
				row.regional,
				row.nome,
				row.tipo,
				row.status,
				row.atendenteId,
				row.atendenteNome,
				row.arquivo,
				row.total,
				row.pendentes,
				row.agendados,
				row.retirados,
				row.multas,
				row.lojas,
				JSON.stringify(row.clientes),
				row.iniciadoEm,
				row.iniciadoEmLocal,
				row.finalizadoEm,
				row.criadoPorId,
				row.criadoPorNome,
				row.criadoEm,
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertCustomers(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_clientes
			 (id, document_id_original, cliente_id_original, bloco_id, bloco_document_id_original,
			  codigo_cliente, nome, cidade, regional, filial_id, empresa, status, ordem, telefones,
			  tentativas, terminal_at, privacy_expires_at, agendamento_id, origem_agendamento_id,
			  reagendamento_numero, motivo_nao_recolhimento, data_retirada, equipamento_retirado,
			  retirado_por_id, retirado_por_nome, entrega_loja, entrega_loja_comentario,
			  entrega_loja_data, entrega_loja_por_id, entrega_loja_por_nome,
			  entrega_loja_registrada_em_local, criado_em, atualizado_em, legacy_path,
			  legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38::jsonb)
			 on conflict (id) do update set
			   document_id_original = excluded.document_id_original,
			   cliente_id_original = excluded.cliente_id_original,
			   bloco_id = excluded.bloco_id,
			   bloco_document_id_original = excluded.bloco_document_id_original,
			   codigo_cliente = excluded.codigo_cliente,
			   nome = excluded.nome,
			   cidade = excluded.cidade,
			   regional = excluded.regional,
			   filial_id = excluded.filial_id,
			   empresa = excluded.empresa,
			   status = excluded.status,
			   ordem = excluded.ordem,
			   telefones = excluded.telefones,
			   tentativas = excluded.tentativas,
			   terminal_at = excluded.terminal_at,
			   privacy_expires_at = excluded.privacy_expires_at,
			   agendamento_id = excluded.agendamento_id,
			   origem_agendamento_id = excluded.origem_agendamento_id,
			   reagendamento_numero = excluded.reagendamento_numero,
			   motivo_nao_recolhimento = excluded.motivo_nao_recolhimento,
			   data_retirada = excluded.data_retirada,
			   equipamento_retirado = excluded.equipamento_retirado,
			   retirado_por_id = excluded.retirado_por_id,
			   retirado_por_nome = excluded.retirado_por_nome,
			   entrega_loja = excluded.entrega_loja,
			   entrega_loja_comentario = excluded.entrega_loja_comentario,
			   entrega_loja_data = excluded.entrega_loja_data,
			   entrega_loja_por_id = excluded.entrega_loja_por_id,
			   entrega_loja_por_nome = excluded.entrega_loja_por_nome,
			   entrega_loja_registrada_em_local = excluded.entrega_loja_registrada_em_local,
			   criado_em = excluded.criado_em,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.clienteIdOriginal,
				row.blocoId,
				row.blocoDocumentIdOriginal,
				row.codigoCliente,
				row.nome,
				row.cidade,
				row.regional,
				row.filialId,
				row.empresa,
				row.status,
				row.ordem,
				JSON.stringify(row.telefones),
				row.tentativas,
				row.terminalAt,
				row.privacyExpiresAt,
				row.agendamentoId,
				row.origemAgendamentoId,
				row.reagendamentoNumero,
				row.motivoNaoRecolhimento,
				row.dataRetirada,
				row.equipamentoRetirado,
				row.retiradoPorId,
				row.retiradoPorNome,
				row.entregaLoja,
				row.entregaLojaComentario,
				row.entregaLojaData,
				row.entregaLojaPorId,
				row.entregaLojaPorNome,
				row.entregaLojaRegistradaEmLocal,
				row.criadoEm,
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertCustomerIndex(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_cliente_index
			 (id, document_id_original, bloco_id, bloco_document_id_original, codigo_cliente,
			  filial_id, status, criado_em, atualizado_em, legacy_path, legacy_document_id,
			  created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
			 on conflict (id) do update set
			   document_id_original = excluded.document_id_original,
			   bloco_id = excluded.bloco_id,
			   bloco_document_id_original = excluded.bloco_document_id_original,
			   codigo_cliente = excluded.codigo_cliente,
			   filial_id = excluded.filial_id,
			   status = excluded.status,
			   criado_em = excluded.criado_em,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.blocoId,
				row.blocoDocumentIdOriginal,
				row.codigoCliente,
				row.filialId,
				row.status,
				row.criadoEm,
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertAppointments(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamentos
			 (id, document_id_original, codigo_cliente, cliente_nome, telefone, telefones, cidade,
			  regional, empresa, data, hora, turno, status, tecnico_nome, observacao, origem, os,
			  filial_id, bloco_id, bloco_document_id_original, atendente_id, atendente_nome,
			  usuario_id, usuario_nome, criado_por_id, criado_por_nome, agendado_por_id,
			  agendado_por_nome, atualizado_por_id, atualizado_por_nome, recolhido_em,
			  motivo_recolhido, nao_recolhido_em, motivo_nao_recolhido, desfecho_em,
			  desfecho_por_id, desfecho_por_nome, equipamento_retirado, motivo_nao_recolhimento,
			  bloco_reagendamento_id, reagendamento_numero, enviado_reagendamento,
			  mercado_compra_id, mercado_compra_status, mercado_comprado_em, mercado_empresa_id,
			  mercado_empresa_nome, verificacao_mapa, criado_em, atualizado_em, legacy_path,
			  legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48::jsonb,$49,$50,$51,$52,$53,$54,$55::jsonb)
			 on conflict (id) do update set
			   codigo_cliente = excluded.codigo_cliente,
			   cliente_nome = excluded.cliente_nome,
			   telefone = excluded.telefone,
			   telefones = excluded.telefones,
			   cidade = excluded.cidade,
			   regional = excluded.regional,
			   empresa = excluded.empresa,
			   data = excluded.data,
			   hora = excluded.hora,
			   turno = excluded.turno,
			   status = excluded.status,
			   tecnico_nome = excluded.tecnico_nome,
			   observacao = excluded.observacao,
			   origem = excluded.origem,
			   os = excluded.os,
			   filial_id = excluded.filial_id,
			   bloco_id = excluded.bloco_id,
			   bloco_document_id_original = excluded.bloco_document_id_original,
			   atendente_id = excluded.atendente_id,
			   atendente_nome = excluded.atendente_nome,
			   usuario_id = excluded.usuario_id,
			   usuario_nome = excluded.usuario_nome,
			   criado_por_id = excluded.criado_por_id,
			   criado_por_nome = excluded.criado_por_nome,
			   agendado_por_id = excluded.agendado_por_id,
			   agendado_por_nome = excluded.agendado_por_nome,
			   atualizado_por_id = excluded.atualizado_por_id,
			   atualizado_por_nome = excluded.atualizado_por_nome,
			   recolhido_em = excluded.recolhido_em,
			   motivo_recolhido = excluded.motivo_recolhido,
			   nao_recolhido_em = excluded.nao_recolhido_em,
			   motivo_nao_recolhido = excluded.motivo_nao_recolhido,
			   desfecho_em = excluded.desfecho_em,
			   desfecho_por_id = excluded.desfecho_por_id,
			   desfecho_por_nome = excluded.desfecho_por_nome,
			   equipamento_retirado = excluded.equipamento_retirado,
			   motivo_nao_recolhimento = excluded.motivo_nao_recolhimento,
			   bloco_reagendamento_id = excluded.bloco_reagendamento_id,
			   reagendamento_numero = excluded.reagendamento_numero,
			   enviado_reagendamento = excluded.enviado_reagendamento,
			   mercado_compra_id = excluded.mercado_compra_id,
			   mercado_compra_status = excluded.mercado_compra_status,
			   mercado_comprado_em = excluded.mercado_comprado_em,
			   mercado_empresa_id = excluded.mercado_empresa_id,
			   mercado_empresa_nome = excluded.mercado_empresa_nome,
			   verificacao_mapa = excluded.verificacao_mapa,
			   criado_em = excluded.criado_em,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.codigoCliente,
				row.clienteNome,
				row.telefone,
				JSON.stringify(row.telefones),
				row.cidade,
				row.regional,
				row.empresa,
				row.data,
				row.hora,
				row.turno,
				row.status,
				row.tecnicoNome,
				row.observacao,
				row.origem,
				row.os,
				row.filialId,
				row.blocoId,
				row.blocoDocumentIdOriginal,
				row.atendenteId,
				row.atendenteNome,
				row.usuarioId,
				row.usuarioNome,
				row.criadoPorId,
				row.criadoPorNome,
				row.agendadoPorId,
				row.agendadoPorNome,
				row.atualizadoPorId,
				row.atualizadoPorNome,
				row.recolhidoEm,
				row.motivoRecolhido,
				row.naoRecolhidoEm,
				row.motivoNaoRecolhido,
				row.desfechoEm,
				row.desfechoPorId,
				row.desfechoPorNome,
				row.equipamentoRetirado,
				row.motivoNaoRecolhimento,
				row.blocoReagendamentoId,
				row.reagendamentoNumero,
				row.enviadoReagendamento,
				row.mercadoCompraId,
				row.mercadoCompraStatus,
				row.mercadoCompradoEm,
				row.mercadoEmpresaId,
				row.mercadoEmpresaNome,
				JSON.stringify(row.verificacaoMapa),
				row.criadoEm,
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertAppointmentLogs(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamentos_logs
			 (id, document_id_original, tipo, agendamento_id, agendamento_document_id_original,
			  codigo_cliente, cliente_nome, cidade, data_agendamento, hora, origem, criterio,
			  resultado, status_anterior, status_novo, motivo, os_encontrada, criado_em,
			  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
			 on conflict (id) do update set
			   tipo = excluded.tipo,
			   agendamento_id = excluded.agendamento_id,
			   agendamento_document_id_original = excluded.agendamento_document_id_original,
			   codigo_cliente = excluded.codigo_cliente,
			   cliente_nome = excluded.cliente_nome,
			   cidade = excluded.cidade,
			   data_agendamento = excluded.data_agendamento,
			   hora = excluded.hora,
			   origem = excluded.origem,
			   criterio = excluded.criterio,
			   resultado = excluded.resultado,
			   status_anterior = excluded.status_anterior,
			   status_novo = excluded.status_novo,
			   motivo = excluded.motivo,
			   os_encontrada = excluded.os_encontrada,
			   criado_em = excluded.criado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.tipo,
				row.agendamentoId,
				row.agendamentoDocumentIdOriginal,
				row.codigoCliente,
				row.clienteNome,
				row.cidade,
				row.dataAgendamento,
				row.hora,
				row.origem,
				row.criterio,
				row.resultado,
				row.statusAnterior,
				row.statusNovo,
				row.motivo,
				row.osEncontrada,
				row.criadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertEsteiraLogs(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_logs
			 (id, document_id_original, tipo, filial_id, request_id, usuario_id, usuario_nome,
			  usuario_role, arquivo, bloco_id, bloco_document_id_original, cliente_id,
			  cliente_document_id_original, agendamento_id, agendamento_document_id_original,
			  codigo_cliente, cliente_nome, cidade, regional, empresa, data, hora, turno,
			  tentativa, quantidade_blocos, quantidade_clientes, quantidade_ignorados,
			  clientes_total, agendados, recolhidos, retirados, multas, lojas, nao_recolhidos,
			  entregas_loja, motivo, comentario, payload, criado_em, legacy_path,
			  legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38::jsonb,$39,$40,$41,$42,$43,$44::jsonb)
			 on conflict (id) do update set
			   tipo = excluded.tipo,
			   filial_id = excluded.filial_id,
			   request_id = excluded.request_id,
			   usuario_id = excluded.usuario_id,
			   usuario_nome = excluded.usuario_nome,
			   usuario_role = excluded.usuario_role,
			   arquivo = excluded.arquivo,
			   bloco_id = excluded.bloco_id,
			   bloco_document_id_original = excluded.bloco_document_id_original,
			   cliente_id = excluded.cliente_id,
			   cliente_document_id_original = excluded.cliente_document_id_original,
			   agendamento_id = excluded.agendamento_id,
			   agendamento_document_id_original = excluded.agendamento_document_id_original,
			   codigo_cliente = excluded.codigo_cliente,
			   cliente_nome = excluded.cliente_nome,
			   cidade = excluded.cidade,
			   regional = excluded.regional,
			   empresa = excluded.empresa,
			   data = excluded.data,
			   hora = excluded.hora,
			   turno = excluded.turno,
			   tentativa = excluded.tentativa,
			   quantidade_blocos = excluded.quantidade_blocos,
			   quantidade_clientes = excluded.quantidade_clientes,
			   quantidade_ignorados = excluded.quantidade_ignorados,
			   clientes_total = excluded.clientes_total,
			   agendados = excluded.agendados,
			   recolhidos = excluded.recolhidos,
			   retirados = excluded.retirados,
			   multas = excluded.multas,
			   lojas = excluded.lojas,
			   nao_recolhidos = excluded.nao_recolhidos,
			   entregas_loja = excluded.entregas_loja,
			   motivo = excluded.motivo,
			   comentario = excluded.comentario,
			   payload = excluded.payload,
			   criado_em = excluded.criado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				row.tipo,
				row.filialId,
				row.requestId,
				row.usuarioId,
				row.usuarioNome,
				row.usuarioRole,
				row.arquivo,
				row.blocoId,
				row.blocoDocumentIdOriginal,
				row.clienteId,
				row.clienteDocumentIdOriginal,
				row.agendamentoId,
				row.agendamentoDocumentIdOriginal,
				row.codigoCliente,
				row.clienteNome,
				row.cidade,
				row.regional,
				row.empresa,
				row.data,
				row.hora,
				row.turno,
				row.tentativa,
				row.quantidadeBlocos,
				row.quantidadeClientes,
				row.quantidadeIgnorados,
				row.clientesTotal,
				row.agendados,
				row.recolhidos,
				row.retirados,
				row.multas,
				row.lojas,
				row.naoRecolhidos,
				row.entregasLoja,
				row.motivo,
				row.comentario,
				JSON.stringify(row.payload),
				row.criadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertMetrics(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_metricas
			 (mes, agendamentos, recolhidos, recolhidos_diretos, nao_recolhidos, tentativas,
			  multas, entregas_loja, cidades, usuarios, agendamentos_por_cidade,
			  agendamentos_por_usuario, recolhidos_por_cidade, tentativas_por_cidade,
			  tentativas_por_usuario, multas_por_usuario, nao_recolhidos_por_cidade,
			  entregas_loja_por_cidade, entregas_loja_por_usuario, atualizado_em,
			  legacy_path, legacy_document_id, created_at, updated_at, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21,$22,$23,$24,$25::jsonb)
			 on conflict (mes) do update set
			   agendamentos = excluded.agendamentos,
			   recolhidos = excluded.recolhidos,
			   recolhidos_diretos = excluded.recolhidos_diretos,
			   nao_recolhidos = excluded.nao_recolhidos,
			   tentativas = excluded.tentativas,
			   multas = excluded.multas,
			   entregas_loja = excluded.entregas_loja,
			   cidades = excluded.cidades,
			   usuarios = excluded.usuarios,
			   agendamentos_por_cidade = excluded.agendamentos_por_cidade,
			   agendamentos_por_usuario = excluded.agendamentos_por_usuario,
			   recolhidos_por_cidade = excluded.recolhidos_por_cidade,
			   tentativas_por_cidade = excluded.tentativas_por_cidade,
			   tentativas_por_usuario = excluded.tentativas_por_usuario,
			   multas_por_usuario = excluded.multas_por_usuario,
			   nao_recolhidos_por_cidade = excluded.nao_recolhidos_por_cidade,
			   entregas_loja_por_cidade = excluded.entregas_loja_por_cidade,
			   entregas_loja_por_usuario = excluded.entregas_loja_por_usuario,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.mes,
				row.agendamentos,
				row.recolhidos,
				row.recolhidosDiretos,
				row.naoRecolhidos,
				row.tentativas,
				row.multas,
				row.entregasLoja,
				JSON.stringify(row.cidades),
				JSON.stringify(row.usuarios),
				JSON.stringify(row.agendamentosPorCidade),
				JSON.stringify(row.agendamentosPorUsuario),
				JSON.stringify(row.recolhidosPorCidade),
				JSON.stringify(row.tentativasPorCidade),
				JSON.stringify(row.tentativasPorUsuario),
				JSON.stringify(row.multasPorUsuario),
				JSON.stringify(row.naoRecolhidosPorCidade),
				JSON.stringify(row.entregasLojaPorCidade),
				JSON.stringify(row.entregasLojaPorUsuario),
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function upsertCatalog(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into agendamento_esteira_catalogo
			 (id, document_id_original, blocos, atualizado_em, legacy_path, legacy_document_id,
			  created_at, updated_at, source_payload)
			 values ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9::jsonb)
			 on conflict (id) do update set
			   document_id_original = excluded.document_id_original,
			   blocos = excluded.blocos,
			   atualizado_em = excluded.atualizado_em,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   source_payload = excluded.source_payload`,
			[
				row.id,
				row.documentIdOriginal,
				JSON.stringify(row.blocos),
				row.atualizadoEm,
				row.legacyPath,
				row.legacyDocumentId,
				row.createdAt,
				row.updatedAt,
				JSON.stringify(row.sourcePayload),
			],
		);
	}
}

async function applyMigration(client, normalized) {
	await client.query("begin");
	try {
		await upsertBlocks(client, normalized.agendamento_esteira_blocos);
		await upsertCustomers(client, normalized.agendamento_esteira_clientes);
		await upsertCustomerIndex(client, normalized.agendamento_esteira_cliente_index);
		await upsertAppointments(client, normalized.agendamentos);
		await upsertAppointmentLogs(client, normalized.agendamentos_logs);
		await upsertEsteiraLogs(client, normalized.agendamento_esteira_logs);
		await upsertMetrics(client, normalized.agendamento_esteira_metricas);
		await upsertCatalog(client, normalized.agendamento_esteira_catalogo);
		await client.query("commit");
		return {
			applied: true,
			insertedOrUpdated: Object.fromEntries(
				Object.entries(normalized).map(([collection, rows]) => [
					collection,
					rows.length,
				]),
			),
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

async function main() {
	const pool = new Pool(buildPoolConfig());
	try {
		const client = await pool.connect();
		try {
			const normalized = await loadNormalized(client);
			const report = await buildReport(client, normalized);
			if (apply) {
				report.applyResult = await applyMigration(client, normalized);
				report.targetStatsAfterApply = await targetStats(client);
			}

			const output = JSON.stringify(report, null, 2);
			if (writeJson) {
				process.stdout.write(`${output}\n`);
				return;
			}
			console.log("Migracao Agendamentos/Esteira");
			console.log(output);
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
