const db = require("./db");

const COLLECTION_PATH = "regionais";

function text(value) {
	return String(value ?? "").trim();
}

function normalizeKey(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function buildPessoa(row) {
	if (!row) return null;
	const pessoa = {
		nome: text(row.nome),
		email: text(row.email),
		telefone: text(row.telefone),
	};
	return pessoa.nome || pessoa.email || pessoa.telefone ? pessoa : null;
}

function applyResponsavel(data, row) {
	const tipo = text(row.tipo);
	const pessoa = buildPessoa(row);
	if (!pessoa) return;

	if (tipo === "lider" || tipo === "supervisor") {
		data[tipo] = pessoa;
		return;
	}

	if (tipo === "backoffice") {
		data.backoffices.push(pessoa);
		if (!data.backoffice?.nome && !data.backoffice?.email) {
			data.backoffice = pessoa;
		}
		return;
	}

	if (tipo === "delivery" || tipo === "field_service") {
		const payload = row.source_payload || {};
		const papel = text(payload.papelOperacional || "backoffice");
		const group = data.gruposOperacionais[tipo] || {
			lider: { nome: "", email: "", telefone: "" },
			supervisor: { nome: "", email: "", telefone: "" },
			backoffices: [],
		};
		if (papel === "lider" || papel === "supervisor") {
			group[papel] = pessoa;
		} else {
			group.backoffices.push(pessoa);
		}
		data.gruposOperacionais[tipo] = group;
	}
}

function normalizeRegionalDocument(regional, cidades = [], responsaveis = []) {
	const sourcePayload = regional.source_payload || {};
	const data = {
		...sourcePayload,
		id: regional.id,
		nome: text(regional.nome || sourcePayload.nome || regional.id),
		uf: text(regional.uf || sourcePayload.uf),
		ativo: regional.ativo !== false,
		cidades: cidades.map((cidade) => ({
			...(cidade.source_payload || {}),
			nome: text(cidade.nome),
			tipo: text(cidade.tipo || cidade.source_payload?.tipo),
		})),
		lider: sourcePayload.lider || { nome: "", email: "", telefone: "" },
		supervisor: sourcePayload.supervisor || { nome: "", email: "", telefone: "" },
		backoffice: sourcePayload.backoffice || { nome: "", email: "", telefone: "" },
		backoffices: [],
		gruposOperacionais: { ...(sourcePayload.gruposOperacionais || {}) },
	};

	responsaveis.forEach((row) => applyResponsavel(data, row));
	if (!data.backoffices.length && Array.isArray(sourcePayload.backoffices)) {
		data.backoffices = sourcePayload.backoffices;
	}
	if (!data.backoffice?.nome && data.backoffices[0]) {
		data.backoffice = data.backoffices[0];
	}

	return {
		path: regional.legacy_path || `${COLLECTION_PATH}/${regional.id}`,
		collectionPath: COLLECTION_PATH,
		documentId: regional.legacy_document_id || regional.id,
		parentPath: null,
		data,
		exportedAt: null,
		importedAt: regional.created_at,
		updatedAt: regional.updated_at,
	};
}

async function fetchNormalizedRegionalDocuments({ limit = null, offset = 0 } = {}) {
	const hasLimit = limit !== null && limit !== undefined && limit !== "";
	const limitSql = hasLimit && Number.isFinite(Number(limit)) ? " limit $1 offset $2" : "";
	const params = limitSql ? [Math.max(Number(limit), 1), Math.max(Number(offset), 0)] : [];
	const regionaisResult = await db.query(
		`select id, nome, uf, ativo, legacy_path, legacy_document_id,
		        created_at, updated_at, source_payload
		   from regionais
		  order by lower(nome), id${limitSql}`,
		params,
	);
	if (!regionaisResult.rows.length) return [];
	return hydrateRegionalDocuments(regionaisResult.rows);
}

async function hydrateRegionalDocuments(regionaisRows = []) {
	const ids = regionaisRows.map((row) => row.id);
	const [cidadesResult, responsaveisResult] = await Promise.all([
		db.query(
			`select regional_id, nome, tipo, source_payload
			   from regional_cidades
			  where regional_id = any($1::text[])
			  order by lower(nome)`,
			[ids],
		),
		db.query(
			`select regional_id, tipo, nome, email, telefone, source_payload
			   from regional_responsaveis
			  where regional_id = any($1::text[])
			  order by regional_id, tipo, lower(coalesce(nome, email, ''))`,
			[ids],
		),
	]);

	const cidadesByRegional = new Map();
	cidadesResult.rows.forEach((row) => {
		if (!cidadesByRegional.has(row.regional_id)) {
			cidadesByRegional.set(row.regional_id, []);
		}
		cidadesByRegional.get(row.regional_id).push(row);
	});

	const responsaveisByRegional = new Map();
	responsaveisResult.rows.forEach((row) => {
		if (!responsaveisByRegional.has(row.regional_id)) {
			responsaveisByRegional.set(row.regional_id, []);
		}
		responsaveisByRegional.get(row.regional_id).push(row);
	});

	return regionaisRows.map((regional) =>
		normalizeRegionalDocument(
			regional,
			cidadesByRegional.get(regional.id) || [],
			responsaveisByRegional.get(regional.id) || [],
		),
	);
}

async function listRegionalDocuments({ limit, offset } = {}) {
	return fetchNormalizedRegionalDocuments({ limit, offset });
}

async function listAllRegionalDocuments() {
	return fetchNormalizedRegionalDocuments();
}

async function getRegionalDocument(documentIdOrPath) {
	const value = text(documentIdOrPath);
	if (!value) return null;
	const result = await db.query(
		`select id, nome, uf, ativo, legacy_path, legacy_document_id,
		        created_at, updated_at, source_payload
		   from regionais
		  where id = $1
		     or legacy_document_id = $1
		     or legacy_path = $1
		     or legacy_path = $2
		     or lower(nome) = lower($1)
		  limit 1`,
		[value, `${COLLECTION_PATH}/${value}`],
	);
	if (!result.rows[0]) return null;
	const [item] = await hydrateRegionalDocuments(result.rows);
	return item || null;
}

async function getRegionalByName(regionalName) {
	const target = normalizeKey(regionalName);
	if (!target) return null;
	const rows = await listAllRegionalDocuments();
	const match = rows.find(
		(row) => normalizeKey(row.data?.nome || row.documentId) === target,
	);
	return match?.data || null;
}

// SHA-1 aqui NAO protege segredo nenhum — gera um UUID v5-like
// DETERMINISTICO a partir de uma chave de negocio (cidade, responsavel),
// pra idempotencia de migracao/dual-write (mesmo seed -> mesmo id, evita
// duplicar registro ja existente). Trocar o algoritmo mudaria o id gerado
// pra registros que ja existem em producao (migration
// 030_regionais_usuarios_normalizacao.sql, ja aplicada), causando
// duplicidade em vez de atualizacao no proximo dual-write/migracao. NAO
// alterar sem migrar os ids existentes primeiro.
function stableUuid(seed) {
	const crypto = require("node:crypto");
	const hash = crypto.createHash("sha1").update(String(seed)).digest(); // NOSONAR (javascript:S4790): ver comentario acima
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

function timestampValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return timestampValue(value.value);
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRegionalTimestamps(data = {}) {
	const createdAt =
		timestampValue(data.criado_em) ||
		timestampValue(data.createdAt) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizado_em) ||
		timestampValue(data.updatedAt) ||
		createdAt;
	return { createdAt, updatedAt };
}

function normalizeCidades(data = {}, regionalId, path) {
	const rawCidades = Array.isArray(data.cidades) ? data.cidades : [];
	const cidades = rawCidades
		.map((cidade, index) => ({
			id: stableUuid(`${path}:cidade:${normalizeKey(cidade?.nome || cidade)}`),
			regionalId,
			nome: text(cidade?.nome || cidade?.name || cidade),
			tipo: text(cidade?.tipo || cidade?.type) || null,
			legacyPath: `${path}/cidades/${index}`,
			legacyDocumentId: text(cidade?.nome || cidade),
			sourcePayload: cidade,
		}))
		.filter((cidade) => cidade.nome);
	if (!cidades.length && text(data.cidade)) {
		cidades.push({
			id: stableUuid(`${path}:cidade:${normalizeKey(data.cidade)}`),
			regionalId,
			nome: text(data.cidade),
			tipo: null,
			legacyPath: `${path}/cidades/0`,
			legacyDocumentId: text(data.cidade),
			sourcePayload: { nome: text(data.cidade), origem: "cidade" },
		});
	}
	const seen = new Set();
	return cidades.filter((cidade) => {
		const key = normalizeKey(cidade.nome);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function personRecord(data, regionalId, tipo, person, legacySuffix, path, extraPayload = {}) {
	const nome = text(person?.nome || person?.name) || null;
	const email = text(person?.email) || null;
	const telefone = text(person?.telefone || person?.phone) || null;
	if (!nome && !email && !telefone) return null;
	return {
		id: stableUuid(`${path}:responsavel:${tipo}:${legacySuffix}:${normalizeKey(email || nome || telefone)}`),
		regionalId,
		tipo,
		nome,
		email,
		telefone,
		legacyPath: `${path}/responsaveis/${legacySuffix}`,
		legacyDocumentId: legacySuffix,
		sourcePayload: { ...extraPayload, ...(person || {}) },
	};
}

function normalizeResponsaveis(data = {}, regionalId, path) {
	const responsaveis = [
		personRecord(data, regionalId, "lider", data.lider, "lider", path),
		personRecord(data, regionalId, "supervisor", data.supervisor, "supervisor", path),
		personRecord(data, regionalId, "backoffice", data.backoffice, "backoffice", path),
	];
	(data.backoffices || []).forEach((person, index) => {
		responsaveis.push(
			personRecord(data, regionalId, "backoffice", person, `backoffices/${index}`, path),
		);
	});
	Object.entries(data.gruposOperacionais || {}).forEach(([groupKey, group]) => {
		if (!["delivery", "field_service"].includes(groupKey)) return;
		responsaveis.push(
			personRecord(data, regionalId, groupKey, group?.lider, `${groupKey}/lider`, path, {
				papelOperacional: "lider",
			}),
		);
		responsaveis.push(
			personRecord(
				data,
				regionalId,
				groupKey,
				group?.supervisor,
				`${groupKey}/supervisor`,
				path,
				{ papelOperacional: "supervisor" },
			),
		);
		(group?.backoffices || []).forEach((person, index) => {
			responsaveis.push(
				personRecord(
					data,
					regionalId,
					groupKey,
					person,
					`${groupKey}/backoffices/${index}`,
					path,
					{ papelOperacional: "backoffice" },
				),
			);
		});
	});
	return responsaveis.filter(Boolean);
}

async function resolveRegionalId({ documentId, data, path }) {
	const current = await getRegionalDocument(path || documentId);
	if (current?.data?.id) return current.data.id;
	const byName = await getRegionalDocument(data?.nome || data?.name || "");
	if (byName?.data?.id) return byName.data.id;
	return text(data?.id || documentId);
}

async function upsertRegionalDocument({ documentId, data = {} }) {
	const id = await resolveRegionalId({
		documentId,
		data,
		path: `${COLLECTION_PATH}/${documentId}`,
	});
	const nome = text(data.nome || data.name || documentId || id);
	if (!id || !nome) {
		const error = new Error("Regional precisa ter id e nome.");
		error.statusCode = 400;
		throw error;
	}
	const { createdAt, updatedAt } = getRegionalTimestamps(data);
	const result = await db.query(
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
			text(data.uf) || null,
			data.ativo !== false,
			`${COLLECTION_PATH}/${documentId || id}`,
			documentId || id,
			createdAt,
			updatedAt,
			JSON.stringify(data),
		],
	);
	const regionalId = result.rows[0].id;
	await db.query("delete from regional_cidades where regional_id = $1", [regionalId]);
	await db.query("delete from regional_responsaveis where regional_id = $1", [regionalId]);

	for (const cidade of normalizeCidades(data, regionalId, `${COLLECTION_PATH}/${documentId || id}`)) {
		await db.query(
			`insert into regional_cidades
			 (id, regional_id, nome, tipo, legacy_path, legacy_document_id,
			  created_at, updated_at, source_payload)
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
				createdAt,
				updatedAt,
				JSON.stringify(cidade.sourcePayload || {}),
			],
		);
	}

	for (const responsavel of normalizeResponsaveis(data, regionalId, `${COLLECTION_PATH}/${documentId || id}`)) {
		await db.query(
			`insert into regional_responsaveis
			 (id, regional_id, tipo, nome, email, telefone, legacy_path,
			  legacy_document_id, created_at, updated_at, source_payload)
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
				createdAt,
				updatedAt,
				JSON.stringify(responsavel.sourcePayload || {}),
			],
		);
	}

	return getRegionalDocument(documentId || id);
}

async function deleteRegionalDocument(documentIdOrPath) {
	const item = await getRegionalDocument(documentIdOrPath);
	if (!item) return false;
	await db.query("delete from regionais where id = $1", [item.data.id]);
	return true;
}

module.exports = {
	deleteRegionalDocument,
	getRegionalDocument,
	listAllRegionalDocuments,
	listRegionalDocuments,
	getRegionalByName,
	upsertRegionalDocument,
};
