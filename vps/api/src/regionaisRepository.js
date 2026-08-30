const db = require("./db");
const documents = require("./documents");

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

function logFallback(reason, error = null) {
	const detail = error?.code || error?.message || error || reason;
	console.warn(`[regionais] fallback app_documents: ${reason}`, detail);
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

	const ids = regionaisResult.rows.map((row) => row.id);
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

	return regionaisResult.rows.map((regional) =>
		normalizeRegionalDocument(
			regional,
			cidadesByRegional.get(regional.id) || [],
			responsaveisByRegional.get(regional.id) || [],
		),
	);
}

async function listRegionalDocuments({ limit, offset } = {}) {
	try {
		const rows = await fetchNormalizedRegionalDocuments({ limit, offset });
		if (rows.length) return rows;
		logFallback("tabelas normalizadas sem registros");
	} catch (error) {
		logFallback("falha ao ler tabelas normalizadas", error);
	}
	return documents.listDocuments({
		collectionPath: COLLECTION_PATH,
		limit,
		offset,
	});
}

async function listAllRegionalDocuments() {
	try {
		const rows = await fetchNormalizedRegionalDocuments();
		if (rows.length) return rows;
		logFallback("tabelas normalizadas sem registros");
	} catch (error) {
		logFallback("falha ao ler tabelas normalizadas", error);
	}
	return documents.listAllDocuments(COLLECTION_PATH);
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

module.exports = {
	listAllRegionalDocuments,
	listRegionalDocuments,
	getRegionalByName,
};
