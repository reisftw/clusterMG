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
	const parsed = Number(
		text(value)
			.replace(/[R$\s]/g, "")
			.replace(/\.(?=\d{3}(\D|$))/g, "")
			.replace(",", "."),
	);
	return Number.isFinite(parsed) ? parsed : 0;
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
		situacao: row.situacao || source.situacao || "",
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
	const situacao = text(data.situacao);
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

module.exports = {
	COLLECTIONS,
	deleteDocument,
	getDocument,
	isImoveisCollection,
	listAllDocuments,
	listDocuments,
	upsertDocument,
};
