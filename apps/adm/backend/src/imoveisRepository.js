const crypto = require("node:crypto");
const db = require("./db");

const COLLECTIONS = Object.freeze({
	imoveis: "imoveis_administrativos",
	reajustes: "imoveis_administrativos_reajustes",
	iptu: "imoveis_administrativos_iptu",
	alugueis: "imoveis_administrativos_alugueis",
	contratos: "imoveis_administrativos_contratos",
	anexos: "imoveis_administrativos_anexos",
	aditivos: "imoveis_administrativos_aditivos",
	config: "imoveis_administrativos_config",
});

const COLLECTION_SET = new Set(Object.values(COLLECTIONS));
const ATTACHMENT_COLLECTIONS = new Set([COLLECTIONS.anexos, COLLECTIONS.contratos]);
const EVENT_COLLECTIONS = new Set([
	COLLECTIONS.reajustes,
	COLLECTIONS.iptu,
	COLLECTIONS.alugueis,
	COLLECTIONS.aditivos,
]);

function isImoveisCollection(collectionPath) {
	return COLLECTION_SET.has(String(collectionPath || "").trim());
}

function text(value) {
	return String(value ?? "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	let normalized = text(value).replace(/[R$\s]/g, "");
	if (!normalized) return 0;
	if (normalized.includes(",")) {
		normalized = normalized.replace(/\./g, "").replace(",", ".");
	} else if (normalized.includes(".")) {
		const parts = normalized.split(".");
		const last = parts.at(-1) || "";
		if (last.length === 3 && parts.length > 1) normalized = normalized.replace(/\./g, "");
	}
	const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function imovelMonthlyCost(item = {}) {
	return numberValue(item.valorAluguel || item.valorOriginal || 0);
}

function isAlugado(item = {}) {
	const tipo = normalizeText(item.tipoContrato || item.tipo_contrato);
	return tipo.includes("alug") || tipo.includes("loca") || imovelMonthlyCost(item) > 0;
}

function intValue(value) {
	const parsed = Math.trunc(numberValue(value));
	return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	const normalized = text(value).toLowerCase();
	if (["true", "1", "sim", "s", "ativo", "possui"].includes(normalized)) return true;
	if (["false", "0", "nao", "não", "inativo", "cancelado"].includes(normalized)) return false;
	return null;
}

function timestampValue(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateValue(value) {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.trunc(value));
		return excelEpoch.toISOString().slice(0, 10);
	}
	const raw = text(value);
	if (!raw) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function nowIso() {
	return new Date().toISOString();
}

function hashPath(path) {
	return crypto.createHash("sha256").update(String(path)).digest("hex").slice(0, 32);
}

function collectionFromPath(documentPath) {
	const parts = String(documentPath || "").split("/").filter(Boolean);
	return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function documentIdFromPath(documentPath) {
	return String(documentPath || "").split("/").filter(Boolean).at(-1) || "";
}

function normalizeId(value) {
	return text(value)
		.replace(/[^\w.-]/g, "_")
		.slice(0, 120);
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

function sourcePayload(row = {}, fallback = {}) {
	return { ...(row.source_payload || {}), ...fallback };
}

function documentBase(collectionPath, row = {}, data = {}) {
	const documentId =
		row.legacy_document_id ||
		row.document_id_original ||
		row.senior_id ||
		row.id ||
		documentIdFromPath(row.legacy_path);
	return {
		path: row.legacy_path || `${collectionPath}/${documentId}`,
		collectionPath,
		documentId,
		parentPath: null,
		data: { id: documentId, ...sourcePayload(row), ...data },
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at || null,
	};
}

function mapImovel(row = {}) {
	const source = sourcePayload(row);
	return documentBase(COLLECTIONS.imoveis, row, {
		id: row.senior_id || row.id,
		seniorId: row.senior_id || row.id,
		nome: row.nome || source.nome || "",
		base: row.base || source.base || "",
		ativo: row.ativo !== false,
		status: row.situacao || source.status || source.situacao || "",
		situacao: row.situacao || source.situacao || source.status || "",
		tipoContrato: row.tipo_contrato || source.tipoContrato || "",
		classificacao: row.classificacao || source.classificacao || "",
		endereco: row.endereco || source.endereco || "",
		cidade: row.cidade || source.cidade || "",
		estado: row.estado || source.estado || "",
		bairro: row.bairro || source.bairro || "",
		cep: row.cep || source.cep || "",
		rua: row.rua || source.rua || "",
		numero: row.numero || source.numero || "",
		cnpjCpf: row.cnpj_cpf || source.cnpjCpf || "",
		proprietarioNome: source.proprietarioNome || "",
		proprietarioDocumento: source.proprietarioDocumento || "",
		proprietarioTelefone: source.proprietarioTelefone || "",
		proprietarioEmail: source.proprietarioEmail || "",
		proprietarioContatos: source.proprietarioContatos || "",
		formaPagamento: source.formaPagamento || "",
		energiaValorMedio: source.energiaValorMedio || "",
		energiaCodigoCliente: source.energiaCodigoCliente || "",
		aguaValorMedio: source.aguaValorMedio || "",
		aguaCodigoCliente: source.aguaCodigoCliente || "",
		linkContratoOriginal: source.linkContratoOriginal || "",
		linkApolice: source.linkApolice || "",
		vigilanciaContratoLink: source.vigilanciaContratoLink || "",
		vigilanciaValorMensal: source.vigilanciaValorMensal || "",
		limpezaContrato: source.limpezaContrato || "",
		limpezaValorMedio: source.limpezaValorMedio || "",
		ppciLink: source.ppciLink || "",
		ppciVencimento: source.ppciVencimento || "",
		avcbVencimento: source.avcbVencimento || "",
		alvaraFuncionamentoLink: source.alvaraFuncionamentoLink || "",
		alvaraFuncionamentoVencimento: source.alvaraFuncionamentoVencimento || "",
		iptuResponsavel: source.iptuResponsavel || "",
		iptuLink: source.iptuLink || "",
		iptuValorPago2025: source.iptuValorPago2025 || "",
		iptuValorPago2026: source.iptuValorPago2026 || "",
		diretoria: row.diretoria || source.diretoria || "",
		valorAluguel: Number(row.valor_aluguel || 0),
		valorOriginal: Number(row.valor_original || 0),
		valorM2: Number(row.valor_m2 || 0),
		metrosQuadrados: Number(row.metros_quadrados || 0),
		vencimentoAluguelDia: row.vencimento_aluguel_dia || "",
		contratoInicio: dateValue(row.contrato_inicio) || "",
		contratoFim: dateValue(row.contrato_fim) || "",
		mesReajuste: row.mes_reajuste || "",
		dataUltimoReajuste: dateValue(row.data_ultimo_reajuste) || "",
		encerramento: dateValue(row.encerramento) || "",
		dataInativacao: dateValue(row.data_inativacao) || "",
		motivoInativacao: row.motivo_inativacao || "",
		observacao: row.observacao || "",
		driveRootFolderId: row.drive_root_folder_id || "",
		driveFolderId: row.drive_folder_id || "",
		driveFolderName: row.drive_folder_name || "",
		mapsUrl: row.maps_url || "",
		streetViewUrl: row.street_view_url || "",
		createdBy: row.created_by || "",
		updatedBy: row.updated_by || "",
		createdByName: row.created_by_name || "",
		updatedByName: row.updated_by_name || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function mapConfig(row = {}) {
	return documentBase(COLLECTIONS.config, row, {
		...(row.data || {}),
		updatedBy: row.updated_by || "",
		updatedByName: row.updated_by_name || "",
		updatedAt: row.updated_at,
	});
}

function mapAttachment(row = {}) {
	return documentBase(row.source_collection || COLLECTIONS.anexos, row, {
		imovelId: row.imovel_id || "",
		tipo: row.tipo || "",
		categoria: row.categoria || "",
		nome: row.nome || "",
		url: row.url || "",
		driveFileId: row.drive_file_id || "",
		driveFolderId: row.drive_folder_id || "",
		mimeType: row.mime_type || "",
		tamanho: Number(row.tamanho || 0),
		observacao: row.observacao || "",
		data: dateValue(row.data) || "",
		createdBy: row.created_by || "",
		createdByName: row.created_by_name || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function mapEvent(row = {}) {
	return documentBase(row.source_collection, row, {
		imovelId: row.imovel_id || "",
		tipo: row.tipo || "",
		ano: row.ano ? String(row.ano) : "",
		mes: row.mes ? String(row.mes) : "",
		competencia: row.competencia || "",
		valor: Number(row.valor || 0),
		valorAnterior: row.valor_anterior === null ? undefined : Number(row.valor_anterior || 0),
		valorNovo: row.valor_novo === null ? undefined : Number(row.valor_novo || 0),
		vencimento: dateValue(row.vencimento) || "",
		data: dateValue(row.data) || "",
		pago: row.pago,
		descricao: row.descricao || "",
		observacao: row.observacao || "",
		anexoId: row.anexo_id || "",
		driveFileId: row.drive_file_id || "",
		createdBy: row.created_by || "",
		createdByName: row.created_by_name || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function normalizeImovelRecord(record = {}) {
	const data = record.data || {};
	const id = text(data.seniorId || data.idSenior || data.id || record.documentId) || hashPath(record.path);
	const situacao = text(data.situacao || data.status);
	const ativo =
		boolValue(data.ativo) ??
		!["inativo", "cancelado", "encerrado"].includes(situacao.toLowerCase());
	return {
		id,
		senior_id: text(data.seniorId || data.idSenior || id),
		nome: text(data.nome || data.titulo),
		base: text(data.base || data.codigoEmpresa).toUpperCase(),
		ativo,
		situacao,
		tipo_contrato: text(data.tipoContrato || data.tipo_contrato),
		classificacao: text(data.classificacao || data.ocupacao),
		endereco: text(data.endereco),
		cidade: text(data.cidade),
		estado: text(data.estado),
		bairro: text(data.bairro),
		cep: text(data.cep),
		rua: text(data.rua),
		numero: text(data.numero),
		cnpj_cpf: text(data.cnpjCpf || data.cnpj),
		diretoria: text(data.diretoria),
		valor_aluguel: numberValue(data.valorAluguel),
		valor_original: numberValue(data.valorOriginal),
		valor_m2: numberValue(data.valorM2),
		metros_quadrados: numberValue(data.metrosQuadrados || data.m2),
		vencimento_aluguel_dia: intValue(data.vencimentoAluguelDia),
		contrato_inicio: dateValue(data.contratoInicio),
		contrato_fim: dateValue(data.contratoFim || data.finalVigencia),
		mes_reajuste: intValue(data.mesReajuste),
		data_ultimo_reajuste: dateValue(data.dataUltimoReajuste),
		encerramento: dateValue(data.encerramento),
		data_inativacao: dateValue(data.dataInativacao),
		motivo_inativacao: text(data.motivoInativacao),
		observacao: text(data.observacao),
		drive_root_folder_id: text(data.driveRootFolderId),
		drive_folder_id: text(data.driveFolderId),
		drive_folder_name: text(data.driveFolderName),
		maps_url: text(data.mapsUrl),
		street_view_url: text(data.streetViewUrl),
		created_by: text(data.createdBy),
		updated_by: text(data.updatedBy),
		created_by_name: text(data.createdByName),
		updated_by_name: text(data.updatedByName),
		legacy_path: record.path || `${COLLECTIONS.imoveis}/${id}`,
		legacy_document_id: record.documentId || id,
		created_at: timestampValue(data.createdAt) || nowIso(),
		updated_at: timestampValue(data.updatedAt) || nowIso(),
		source_payload: data,
	};
}

function normalizeAttachmentRecord(record = {}) {
	const data = record.data || {};
	return {
		id: text(record.documentId || data.id) || hashPath(record.path),
		imovel_id: text(data.imovelId),
		source_collection: record.collectionPath,
		tipo: text(data.tipo),
		categoria: text(data.categoria || (record.collectionPath === COLLECTIONS.contratos ? "contrato" : "")),
		nome: text(data.nome),
		url: text(data.url),
		drive_file_id: text(data.driveFileId),
		drive_folder_id: text(data.driveFolderId),
		mime_type: text(data.mimeType),
		tamanho: numberValue(data.tamanho),
		observacao: text(data.observacao),
		data: dateValue(data.data),
		created_by: text(data.createdBy),
		created_by_name: text(data.createdByName),
		legacy_path: record.path,
		legacy_document_id: record.documentId,
		created_at: timestampValue(data.createdAt) || nowIso(),
		updated_at: timestampValue(data.updatedAt) || nowIso(),
		source_payload: data,
	};
}

function normalizeEventRecord(record = {}) {
	const data = record.data || {};
	const tipoByCollection = {
		[COLLECTIONS.reajustes]: "reajuste",
		[COLLECTIONS.iptu]: "iptu",
		[COLLECTIONS.alugueis]: "aluguel",
		[COLLECTIONS.aditivos]: "aditivo",
	};
	const ano = intValue(data.ano);
	const mes = intValue(data.mes);
	return {
		id: text(record.documentId || data.id) || hashPath(record.path),
		imovel_id: text(data.imovelId),
		source_collection: record.collectionPath,
		tipo: text(data.tipo) || tipoByCollection[record.collectionPath],
		competencia: [ano, mes ? String(mes).padStart(2, "0") : ""].filter(Boolean).join("-"),
		ano,
		mes,
		valor: numberValue(data.valor ?? data.valorNovo),
		valor_anterior: data.valorAnterior === undefined ? null : numberValue(data.valorAnterior),
		valor_novo: data.valorNovo === undefined ? null : numberValue(data.valorNovo),
		vencimento: dateValue(data.vencimento),
		data: dateValue(data.data || data.vencimento || data.createdAt),
		pago: boolValue(data.pago),
		descricao: text(data.descricao || data.nome),
		observacao: text(data.observacao),
		anexo_id: text(data.anexoId),
		drive_file_id: text(data.driveFileId),
		payload: data,
		created_by: text(data.createdBy),
		created_by_name: text(data.createdByName),
		legacy_path: record.path,
		legacy_document_id: record.documentId,
		created_at: timestampValue(data.createdAt) || nowIso(),
		updated_at: timestampValue(data.updatedAt) || nowIso(),
		source_payload: data,
	};
}

async function listDocuments({ collectionPath, limit, offset }) {
	const normalizedLimit = normalizeLimit(limit);
	const normalizedOffset = normalizeOffset(offset);
	const all = await listAllDocuments(collectionPath);
	return all.slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

async function listAllDocuments(collectionPath) {
	if (collectionPath === COLLECTIONS.imoveis) {
		const result = await db.query("select * from imoveis order by id");
		return result.rows.map(mapImovel);
	}
	if (collectionPath === COLLECTIONS.config) {
		const result = await db.query("select * from imoveis_config order by id");
		return result.rows.map(mapConfig);
	}
	if (ATTACHMENT_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from imoveis_anexos where source_collection = $1 order by id",
			[collectionPath],
		);
		return result.rows.map(mapAttachment);
	}
	if (EVENT_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from imoveis_eventos_financeiros where source_collection = $1 order by id",
			[collectionPath],
		);
		return result.rows.map(mapEvent);
	}
	return [];
}

async function getDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const documentId = documentIdFromPath(documentPath);
	if (collectionPath === COLLECTIONS.imoveis) {
		const result = await db.query(
			"select * from imoveis where legacy_path = $1 or id = $2 or senior_id = $2 limit 1",
			[documentPath, documentId],
		);
		return result.rows[0] ? mapImovel(result.rows[0]) : null;
	}
	if (collectionPath === COLLECTIONS.config) {
		const result = await db.query(
			"select * from imoveis_config where legacy_path = $1 or id = $2 limit 1",
			[documentPath, documentId],
		);
		return result.rows[0] ? mapConfig(result.rows[0]) : null;
	}
	if (ATTACHMENT_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from imoveis_anexos where source_collection = $1 and (legacy_path = $2 or id = $3) limit 1",
			[collectionPath, documentPath, documentId],
		);
		return result.rows[0] ? mapAttachment(result.rows[0]) : null;
	}
	if (EVENT_COLLECTIONS.has(collectionPath)) {
		const result = await db.query(
			"select * from imoveis_eventos_financeiros where source_collection = $1 and (legacy_path = $2 or id = $3) limit 1",
			[collectionPath, documentPath, documentId],
		);
		return result.rows[0] ? mapEvent(result.rows[0]) : null;
	}
	return null;
}

async function upsertDocument(record = {}) {
	if (record.collectionPath === COLLECTIONS.imoveis) return upsertImovel(record);
	if (record.collectionPath === COLLECTIONS.config) return upsertConfig(record);
	if (ATTACHMENT_COLLECTIONS.has(record.collectionPath)) return upsertAttachment(record);
	if (EVENT_COLLECTIONS.has(record.collectionPath)) return upsertEvent(record);
	return null;
}

async function upsertImovel(record) {
	const row = normalizeImovelRecord(record);
	const columns = Object.keys(row);
	const values = columns.map((column) =>
		row[column] && typeof row[column] === "object" ? JSON.stringify(row[column]) : row[column],
	);
	const updates = columns
		.filter((column) => !["id", "created_at"].includes(column))
		.map((column) => `${column} = excluded.${column}`)
		.join(", ");
	await db.query(
		`insert into imoveis (${columns.join(", ")})
		 values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
		 on conflict (id) do update set ${updates}`,
		values,
	);
	return getDocument(row.legacy_path);
}

async function upsertConfig(record) {
	const data = record.data || {};
	await db.query(
		`insert into imoveis_config
		 (id, data, updated_by, updated_by_name, legacy_path, legacy_document_id,
		  created_at, updated_at, source_payload)
		 values ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$2::jsonb)
		 on conflict (id) do update set
		   data = excluded.data,
		   updated_by = excluded.updated_by,
		   updated_by_name = excluded.updated_by_name,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   updated_at = excluded.updated_at,
		   source_payload = excluded.source_payload`,
		[
			text(record.documentId) || "geral",
			JSON.stringify(data),
			nullableText(data.updatedBy),
			nullableText(data.updatedByName),
			record.path,
			record.documentId,
			timestampValue(data.createdAt) || nowIso(),
			timestampValue(data.updatedAt) || nowIso(),
		],
	);
	return getDocument(record.path);
}

async function upsertAttachment(record) {
	const row = normalizeAttachmentRecord(record);
	await db.query(
		`insert into imoveis_anexos
		 (id, imovel_id, source_collection, tipo, categoria, nome, url, drive_file_id,
		  drive_folder_id, mime_type, tamanho, observacao, data, created_by,
		  created_by_name, legacy_path, legacy_document_id, created_at, updated_at,
		  source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)
		 on conflict (id) do update set
		   imovel_id = excluded.imovel_id,
		   source_collection = excluded.source_collection,
		   tipo = excluded.tipo,
		   categoria = excluded.categoria,
		   nome = excluded.nome,
		   url = excluded.url,
		   drive_file_id = excluded.drive_file_id,
		   drive_folder_id = excluded.drive_folder_id,
		   mime_type = excluded.mime_type,
		   tamanho = excluded.tamanho,
		   observacao = excluded.observacao,
		   data = excluded.data,
		   created_by = excluded.created_by,
		   created_by_name = excluded.created_by_name,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   updated_at = excluded.updated_at,
		   source_payload = excluded.source_payload`,
		[
			row.id,
			nullableText(row.imovel_id),
			row.source_collection,
			row.tipo,
			row.categoria,
			row.nome,
			row.url,
			row.drive_file_id,
			row.drive_folder_id,
			row.mime_type,
			row.tamanho,
			row.observacao,
			row.data,
			row.created_by,
			row.created_by_name,
			row.legacy_path,
			row.legacy_document_id,
			row.created_at,
			row.updated_at,
			JSON.stringify(row.source_payload),
		],
	);
	return getDocument(row.legacy_path);
}

async function upsertEvent(record) {
	const row = normalizeEventRecord(record);
	await db.query(
		`insert into imoveis_eventos_financeiros
		 (id, imovel_id, source_collection, tipo, competencia, ano, mes, valor,
		  valor_anterior, valor_novo, vencimento, data, pago, descricao, observacao,
		  anexo_id, drive_file_id, payload, created_by, created_by_name, legacy_path,
		  legacy_document_id, created_at, updated_at, source_payload)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24,$25::jsonb)
		 on conflict (id) do update set
		   imovel_id = excluded.imovel_id,
		   source_collection = excluded.source_collection,
		   tipo = excluded.tipo,
		   competencia = excluded.competencia,
		   ano = excluded.ano,
		   mes = excluded.mes,
		   valor = excluded.valor,
		   valor_anterior = excluded.valor_anterior,
		   valor_novo = excluded.valor_novo,
		   vencimento = excluded.vencimento,
		   data = excluded.data,
		   pago = excluded.pago,
		   descricao = excluded.descricao,
		   observacao = excluded.observacao,
		   anexo_id = excluded.anexo_id,
		   drive_file_id = excluded.drive_file_id,
		   payload = excluded.payload,
		   created_by = excluded.created_by,
		   created_by_name = excluded.created_by_name,
		   legacy_path = excluded.legacy_path,
		   legacy_document_id = excluded.legacy_document_id,
		   updated_at = excluded.updated_at,
		   source_payload = excluded.source_payload`,
		[
			row.id,
			nullableText(row.imovel_id),
			row.source_collection,
			row.tipo,
			row.competencia,
			row.ano,
			row.mes,
			row.valor,
			row.valor_anterior,
			row.valor_novo,
			row.vencimento,
			row.data,
			row.pago,
			row.descricao,
			row.observacao,
			row.anexo_id,
			row.drive_file_id,
			JSON.stringify(row.payload),
			row.created_by,
			row.created_by_name,
			row.legacy_path,
			row.legacy_document_id,
			row.created_at,
			row.updated_at,
			JSON.stringify(row.source_payload),
		],
	);
	return getDocument(row.legacy_path);
}

async function deleteDocument(documentPath) {
	const collectionPath = collectionFromPath(documentPath);
	const documentId = documentIdFromPath(documentPath);
	if (collectionPath === COLLECTIONS.imoveis) {
		await db.query("delete from imoveis where legacy_path = $1 or id = $2 or senior_id = $2", [
			documentPath,
			documentId,
		]);
		return;
	}
	if (collectionPath === COLLECTIONS.config) {
		await db.query("delete from imoveis_config where legacy_path = $1 or id = $2", [
			documentPath,
			documentId,
		]);
		return;
	}
	if (ATTACHMENT_COLLECTIONS.has(collectionPath)) {
		await db.query(
			"delete from imoveis_anexos where source_collection = $1 and (legacy_path = $2 or id = $3)",
			[collectionPath, documentPath, documentId],
		);
		return;
	}
	if (EVENT_COLLECTIONS.has(collectionPath)) {
		await db.query(
			"delete from imoveis_eventos_financeiros where source_collection = $1 and (legacy_path = $2 or id = $3)",
			[collectionPath, documentPath, documentId],
		);
	}
}

function mapDomainRecord(row) {
	if (!row) return null;
	return {
		id: row.documentId,
		path: row.path,
		updatedAt: row.updatedAt,
		...(row.data || {}),
	};
}

async function listDomainCollection(collectionPath) {
	const rows = await listAllDocuments(collectionPath);
	return rows.map(mapDomainRecord);
}

async function getDomainRecord(collectionPath, id) {
	const documentId = normalizeId(id);
	if (!documentId) return null;
	return mapDomainRecord(await getDocument(`${collectionPath}/${documentId}`));
}

async function saveDomainRecord(collectionPath, id, data = {}) {
	const documentId = normalizeId(id || data.id || data.seniorId || data.idSenior);
	await upsertDocument({
		path: `${collectionPath}/${documentId}`,
		collectionPath,
		documentId,
		parentPath: null,
		data,
	});
	return { id: documentId, ...data };
}

async function listImoveis({ status = "" } = {}) {
	const imoveis = await listDomainCollection(COLLECTIONS.imoveis);
	if (status === "historico") return imoveis.filter((item) => item.ativo === false);
	if (status === "ativos") return imoveis.filter((item) => item.ativo !== false);
	return imoveis;
}

async function getImovel(id) {
	return getDomainRecord(COLLECTIONS.imoveis, id);
}

async function saveImovel(data = {}) {
	return saveDomainRecord(
		COLLECTIONS.imoveis,
		data.seniorId || data.idSenior || data.id,
		data,
	);
}

async function deleteImovel(id) {
	return deleteDocument(`${COLLECTIONS.imoveis}/${normalizeId(id)}`);
}

async function getConfig() {
	const record = await getDomainRecord(COLLECTIONS.config, "geral");
	if (!record) return null;
	const { id: _id, path: _path, updatedAt: _updatedAt, ...data } = record;
	return data;
}

async function saveConfig(data = {}) {
	return saveDomainRecord(COLLECTIONS.config, "geral", data);
}

async function listReajustes(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.reajustes);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function addReajuste(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.reajustes, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeReajuste(id) {
	return deleteDocument(`${COLLECTIONS.reajustes}/${normalizeId(id)}`);
}

async function listIptu(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.iptu);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function upsertIptu(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.iptu, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeIptu(id) {
	return deleteDocument(`${COLLECTIONS.iptu}/${normalizeId(id)}`);
}

async function listAlugueis(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.alugueis);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function registerAluguel(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.alugueis, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeAluguel(id) {
	return deleteDocument(`${COLLECTIONS.alugueis}/${normalizeId(id)}`);
}

async function listContratos(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.contratos);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function getContrato(id) {
	return getDomainRecord(COLLECTIONS.contratos, id);
}

async function upsertContrato(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.contratos, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeContrato(id) {
	return deleteDocument(`${COLLECTIONS.contratos}/${normalizeId(id)}`);
}

async function listAnexos(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.anexos);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function addAnexo(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.anexos, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeAnexo(id) {
	return deleteDocument(`${COLLECTIONS.anexos}/${normalizeId(id)}`);
}

async function listAditivos(imovelId) {
	const rows = await listDomainCollection(COLLECTIONS.aditivos);
	return rows.filter((item) => item.imovelId === normalizeId(imovelId));
}

async function addAditivo(imovelId, data = {}) {
	const documentId = normalizeId(data.id) || `${normalizeId(imovelId)}_${Date.now()}`;
	return saveDomainRecord(COLLECTIONS.aditivos, documentId, {
		...data,
		imovelId: normalizeId(imovelId),
	});
}

async function removeAditivo(id) {
	return deleteDocument(`${COLLECTIONS.aditivos}/${normalizeId(id)}`);
}

async function getImovelHistorico(imovelId) {
	const imovel = await getImovel(imovelId);
	if (!imovel) return null;
	const [reajustes, iptus, alugueis, contratos, anexos, aditivos] =
		await Promise.all([
			listReajustes(imovel.id),
			listIptu(imovel.id),
			listAlugueis(imovel.id),
			listContratos(imovel.id),
			listAnexos(imovel.id),
			listAditivos(imovel.id),
		]);
	return { imovel, reajustes, iptus, alugueis, contratos, anexos, aditivos };
}

function createPeriodFilter(query = {}) {
	const mes = text(query.mes);
	const ano = text(query.ano);
	return (item = {}, dateKeys = ["data", "vencimento", "createdAt"]) => {
		const source = dateKeys.map((key) => item[key]).find(Boolean);
		if (!source) return !mes && !ano;
		const date = new Date(source);
		if (Number.isNaN(date.getTime())) return !mes && !ano;
		if (ano && String(date.getFullYear()) !== String(ano)) return false;
		if (
			mes &&
			String(date.getMonth() + 1).padStart(2, "0") !==
				String(mes).padStart(2, "0")
		)
			return false;
		return true;
	};
}

function isDateWithinDays(value, days = 30) {
	if (!value) return false;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const limit = new Date(today);
	limit.setDate(limit.getDate() + days);
	return date >= today && date <= limit;
}

function daysUntil(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	date.setHours(0, 0, 0, 0);
	return Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function groupSum(items = [], keyGetter, valueGetter) {
	const map = new Map();
	for (const item of items) {
		const key = keyGetter(item) || "Não informado";
		const current = map.get(key) || { id: key, label: key, valor: 0, count: 0 };
		current.valor += numberValue(valueGetter(item));
		current.count += 1;
		map.set(key, current);
	}
	return [...map.values()].sort((a, b) => b.valor - a.valor || b.count - a.count);
}

function buildContractBucket(days) {
	if (days === null) return "sem_data";
	if (days < 0) return "vencido";
	if (days <= 30) return "0_30";
	if (days <= 60) return "31_60";
	if (days <= 90) return "61_90";
	if (days <= 180) return "91_180";
	return "acima_180";
}

function buildImoveisDashboard({ imoveis, iptus, alugueis, reajustes }) {
	const ativos = imoveis.filter((item) => item.ativo !== false);
	const alugados = ativos.filter(isAlugado);
	const proprios = ativos.filter((item) => !isAlugado(item));
	const custoMensalAtual = alugados.reduce(
		(sum, item) => sum + imovelMonthlyCost(item),
		0,
	);
	const contratosAtencao = alugados
		.map((item) => ({ ...item, diasParaVencimento: daysUntil(item.contratoFim) }))
		.filter(
			(item) =>
				item.diasParaVencimento !== null && item.diasParaVencimento <= 90,
		)
		.sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
	const iptuAtencao = iptus
		.map((item) => ({ ...item, diasParaVencimento: daysUntil(item.vencimento) }))
		.filter(
			(item) =>
				!item.pago &&
				item.diasParaVencimento !== null &&
				item.diasParaVencimento <= 30,
		)
		.sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
	const aluguelAtencao = alugados
		.map((item) => ({
			...item,
			vencimentoAluguel: buildMonthlyDueDate(item.vencimentoAluguelDia),
		}))
		.map((item) => ({
			...item,
			diasParaVencimento: daysUntil(item.vencimentoAluguel),
		}))
		.filter(
			(item) =>
				item.diasParaVencimento !== null &&
				item.diasParaVencimento <= 30,
		)
		.sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
	const requerAtencao = [
		...contratosAtencao.map((item) => ({
			tipo: item.diasParaVencimento < 0 ? "Contrato vencido" : "Contrato a vencer",
			severidade:
				item.diasParaVencimento < 0 || item.diasParaVencimento <= 30
					? "critico"
					: item.diasParaVencimento <= 60
						? "alto"
						: "medio",
			imovelId: item.id,
			imovelNome: item.nome || item.seniorId || item.id,
			descricao:
				item.diasParaVencimento < 0
					? `Contrato vencido há ${Math.abs(item.diasParaVencimento)} dia(s)`
					: `Contrato vence em ${item.diasParaVencimento} dia(s)`,
			data: item.contratoFim,
			valor: imovelMonthlyCost(item),
		})),
		...iptuAtencao.map((item) => ({
			tipo: item.diasParaVencimento < 0 ? "IPTU vencido" : "IPTU a vencer",
			severidade:
				item.diasParaVencimento < 0 || item.diasParaVencimento <= 7
					? "critico"
					: "medio",
			imovelId: item.imovelId,
			imovelNome: item.imovelId || "Imóvel",
			descricao:
				item.diasParaVencimento < 0
					? `IPTU vencido há ${Math.abs(item.diasParaVencimento)} dia(s)`
					: `IPTU vence em ${item.diasParaVencimento} dia(s)`,
			data: item.vencimento,
			valor: numberValue(item.valor),
		})),
		...aluguelAtencao.map((item) => ({
			tipo: "Aluguel a vencer",
			severidade: item.diasParaVencimento <= 7 ? "alto" : "medio",
			imovelId: item.id,
			imovelNome: item.nome || item.seniorId || item.id,
			descricao: `Aluguel vence em ${item.diasParaVencimento} dia(s)`,
			data: item.vencimentoAluguel,
			valor: imovelMonthlyCost(item),
		})),
	].sort((a, b) => {
		const weight = { critico: 0, alto: 1, medio: 2 };
		return (weight[a.severidade] ?? 3) - (weight[b.severidade] ?? 3);
	});
	const custosPorRegional = groupSum(
		alugados,
		(item) => item.cidade || item.diretoria,
		imovelMonthlyCost,
	);
	const custosPorEmpresa = groupSum(
		alugados,
		(item) => item.base,
		imovelMonthlyCost,
	);
	const maioresCustos = [...alugados]
		.sort((a, b) => imovelMonthlyCost(b) - imovelMonthlyCost(a))
		.slice(0, 10)
		.map((item) => ({
			imovelId: item.id,
			imovelNome: item.nome || item.seniorId || item.id,
			cidade: item.cidade || "",
			base: item.base || "",
			valor: imovelMonthlyCost(item),
		}));
	const vencimentosContratos = contratosAtencao.reduce(
		(acc, item) => {
			const bucket = buildContractBucket(item.diasParaVencimento);
			acc[bucket] = (acc[bucket] || 0) + 1;
			return acc;
		},
		{ vencido: 0, "0_30": 0, "31_60": 0, "61_90": 0, "91_180": 0, acima_180: 0, sem_data: 0 },
	);
	const statusOperacional = ativos.reduce((acc, item) => {
		const status = item.situacao || (item.ativo === false ? "Inativo" : "Ativo");
		acc[status] = (acc[status] || 0) + 1;
		return acc;
	}, {});
	const proximosEventos = requerAtencao
		.filter((item) => item.data)
		.slice(0, 12);
	return {
		kpis: {
			totalImoveis: imoveis.length,
			ativos: ativos.length,
			alugados: alugados.length,
			proprios: proprios.length,
			percentualAlugados: ativos.length ? (alugados.length / ativos.length) * 100 : 0,
			percentualProprios: ativos.length ? (proprios.length / ativos.length) * 100 : 0,
			custoMensalAtual,
			custoAnualProjetado: custoMensalAtual * 12,
			contratosAtencao: contratosAtencao.length,
		},
		distribuicao: {
			proprios: proprios.length,
			alugados: alugados.length,
			statusOperacional,
		},
		custosPorRegional,
		custosPorEmpresa,
		maioresCustos,
		vencimentosContratos,
		requerAtencao,
		proximosEventos,
		metadados: {
			historicoCustosDisponivel: alugueis.length > 0,
			reajustesRegistrados: reajustes.length,
			geradoEm: nowIso(),
		},
	};
}

function buildMonthlyDueDate(day, baseDate = new Date()) {
	const date = new Date(
		baseDate.getFullYear(),
		baseDate.getMonth(),
		Math.min(Math.max(Number(day || 1), 1), 28),
	);
	return date.toISOString().slice(0, 10);
}

function buildFinancialReport({ imoveis, iptus, alugueis, reajustes, query }) {
	const inPeriod = createPeriodFilter(query);
	const periodIptus = iptus.filter((item) =>
		inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]),
	);
	const periodAlugueis = alugueis.filter((item) =>
		inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]),
	);
	const imoveisAlugadosAtivos = imoveis.filter(
		(item) => item.ativo !== false && isAlugado(item),
	);
	const gastosIptu = periodIptus.reduce(
		(sum, item) => sum + numberValue(item.valor),
		0,
	);
	const gastosAluguel = periodAlugueis.length
		? periodAlugueis.reduce((sum, item) => sum + numberValue(item.valor), 0)
		: imoveisAlugadosAtivos.reduce(
				(sum, item) => sum + imovelMonthlyCost(item),
				0,
			);
	const contratosProximos = imoveis.filter(
		(item) => item.ativo !== false && isDateWithinDays(item.contratoFim, 60),
	);
	const contratosFinalizados = imoveis.filter(
		(item) =>
			inPeriod({ data: item.contratoFim }, ["data"]) || item.ativo === false,
	);
	const iptuProximo = iptus.filter(
		(item) => !item.pago && isDateWithinDays(item.vencimento, 30),
	);
	const aluguelProximo = imoveis
		.filter((item) => item.ativo !== false && isAlugado(item))
		.map((item) => ({
			...item,
			vencimentoAluguel: buildMonthlyDueDate(item.vencimentoAluguelDia),
		}))
		.filter((item) => isDateWithinDays(item.vencimentoAluguel, 30));

	return {
		resumo: {
			totalImoveis: imoveis.length,
			ativos: imoveis.filter((item) => item.ativo !== false).length,
			alugados: imoveis.filter(isAlugado)
				.length,
			proprios: imoveis.filter((item) => !isAlugado(item))
				.length,
			gastosIptu,
			gastosAluguel,
		},
		gastosIptu: periodIptus,
		gastosAluguel: periodAlugueis,
		contratosProximos,
		contratosFinalizados,
		iptuProximo,
		aluguelProximo,
		reajustes: reajustes.filter((item) =>
			inPeriod(item, ["data", "createdAt"]),
		),
	};
}

async function removeLocalPdfContratos() {
	await db.query(
		"delete from imoveis_anexos where source_collection = $1 and tipo = $2",
		[COLLECTIONS.contratos, "local_pdf"],
	);
}

async function getRelatorioFinanceiroImoveis(query = {}) {
	const [imoveis, reajustes, iptus, alugueis] = await Promise.all([
		listImoveis(),
		listDomainCollection(COLLECTIONS.reajustes),
		listDomainCollection(COLLECTIONS.iptu),
		listDomainCollection(COLLECTIONS.alugueis),
	]);
	return buildFinancialReport({ imoveis, reajustes, iptus, alugueis, query });
}

async function getDashboardImoveis() {
	const [imoveis, reajustes, iptus, alugueis] = await Promise.all([
		listImoveis(),
		listDomainCollection(COLLECTIONS.reajustes),
		listDomainCollection(COLLECTIONS.iptu),
		listDomainCollection(COLLECTIONS.alugueis),
	]);
	return buildImoveisDashboard({ imoveis, reajustes, iptus, alugueis });
}

module.exports = {
	COLLECTIONS,
	addAditivo,
	addAnexo,
	addReajuste,
	buildFinancialReport,
	buildImoveisDashboard,
	deleteDocument,
	deleteImovel,
	getConfig,
	getContrato,
	getDashboardImoveis,
	getDocument,
	getImovel,
	getImovelHistorico,
	getRelatorioFinanceiroImoveis,
	isImoveisCollection,
	listAditivos,
	listAlugueis,
	listAllDocuments,
	listAnexos,
	listContratos,
	listDocuments,
	listImoveis,
	listIptu,
	listReajustes,
	registerAluguel,
	removeAditivo,
	removeAluguel,
	removeAnexo,
	removeContrato,
	removeIptu,
	removeLocalPdfContratos,
	removeReajuste,
	saveConfig,
	saveImovel,
	upsertContrato,
	upsertDocument,
	upsertIptu,
};
