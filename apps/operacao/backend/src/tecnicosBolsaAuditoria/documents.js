const db = require("../db");
const crypto = require("crypto");

function documentFromRow(row) {
	if (!row) return null;
	return {
		path: row.path,
		collectionPath: row.collection_path,
		documentId: row.document_id,
		parentPath: row.parent_path || null,
		data: row.data || {},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function randomDocumentId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

async function listCompaniesAsLegacyDocuments() {
	const { rows } = await db.query(
		`select
			e.id::text as id,
			e.nome,
			e.status,
			e.responsavel_nome,
			e.responsavel_email,
			coalesce(min(er.regional_id), '') as regional_id,
			coalesce(min(r.nome), '') as regional,
			coalesce(
				jsonb_agg(
					distinct jsonb_build_object(
						'id', t.id::text,
						'nome', t.nome,
						'email', coalesce(t.email, ''),
						'emailHubsoft', coalesce(t.email, ''),
						'telefone', coalesce(t.telefone, ''),
						'cidade', coalesce(t.cidade_nome, ''),
						'status', t.status
					)
				) filter (where t.id is not null),
				'[]'::jsonb
			) as tecnicos
		from operacao_empresas e
		left join operacao_empresa_regionais er on er.empresa_id = e.id
		left join regionais r on r.id = er.regional_id
		left join operacao_tecnicos t on t.empresa_id = e.id
		where e.status = 'Ativa'
		group by e.id, e.nome, e.status, e.responsavel_nome, e.responsavel_email
		order by lower(e.nome)`,
	);
	return rows.map((row) => ({
		documentId: row.id,
		path: `empresas_tecnicos/${row.id}`,
		collectionPath: "empresas_tecnicos",
		parentPath: null,
		data: {
			nome: row.nome,
			status: row.status,
			regional: row.regional || "",
			regionalId: row.regional_id || "",
			responsavel: {
				nome: row.responsavel_nome || "",
				email: row.responsavel_email || "",
			},
			supervisor: {
				nome: row.responsavel_nome || "",
				email: row.responsavel_email || "",
			},
			tecnicos: Array.isArray(row.tecnicos) ? row.tecnicos : [],
		},
	}));
}

async function listStockAdjustmentsAsLegacyDocuments() {
	const { rows } = await db.query(
		`select a.*, e.nome as empresa_nome, t.nome as tecnico_nome, r.nome as regional_nome
		from operacao_acertos_estoque a
		left join operacao_empresas e on e.id = a.empresa_id
		left join operacao_tecnicos t on t.id = a.tecnico_id
		left join regionais r on r.id = a.regional_id
		order by a.data_acerto desc, a.created_at desc`,
	);
	const normalized = rows.map((row) => {
		const source = row.source_payload || {};
		const tecnicoLancamentos = Array.isArray(row.itens) ? row.itens : [];
		return {
			documentId: String(row.id),
			path: `acerto_estoque_acertos/${row.id}`,
			collectionPath: "acerto_estoque_acertos",
			parentPath: null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			data: {
				id: String(row.id),
				codigo: row.codigo || "",
				dataAcerto: row.data_acerto,
				status: row.status,
				cidade: source.cidade || "",
				turno: source.turno || "",
				observacoes: row.observacoes || "",
				tecnicoLancamentos,
				lancamentos: tecnicoLancamentos,
				tecnicoNome: row.tecnico_nome || "",
				empresaNome: row.empresa_nome || "",
				tecnicoNomes: Array.isArray(source.tecnicoNomes) ? source.tecnicoNomes : [row.tecnico_nome].filter(Boolean),
				empresaNomes: Array.isArray(source.empresaNomes) ? source.empresaNomes : [row.empresa_nome].filter(Boolean),
				totalTecnicos: tecnicoLancamentos.length || (row.tecnico_id ? 1 : 0),
			},
		};
	});
	const { rows: docs } = await db.query(
		`select path, collection_path, document_id, parent_path, data, created_at, updated_at
		from operacao_documents
		where collection_path = 'acerto_estoque_acertos'
		order by updated_at desc`,
	);
	const seen = new Set(normalized.map((doc) => doc.documentId));
	return [
		...normalized,
		...docs.map(documentFromRow).filter((doc) => !seen.has(doc.documentId)),
	];
}

async function getDocument(path) {
	if (String(path || "").startsWith("integracoes_api/")) {
		const documentId = String(path).split("/").pop();
		const docs = await listAllDocuments("integracoes_api");
		return docs.find((doc) => doc.documentId === documentId) || null;
	}
	const { rows } = await db.query(
		`select path, collection_path, document_id, parent_path, data, created_at, updated_at
		from operacao_documents
		where path = $1
		limit 1`,
		[String(path || "")],
	);
	return documentFromRow(rows[0]);
}

async function listAllDocuments(collectionPath) {
	if (collectionPath === "empresas_tecnicos") return listCompaniesAsLegacyDocuments();
	if (collectionPath === "acerto_estoque_acertos") return listStockAdjustmentsAsLegacyDocuments();
	if (collectionPath === "integracoes_api") {
		const { rows } = await db
			.query("select value from rot_settings where key = 'integrations' limit 1")
			.catch(() => ({ rows: [] }));
		const saved = rows[0]?.value || {};
		const entries = Object.entries(saved).map(([documentId, data]) => ({
			documentId,
			path: `integracoes_api/${documentId}`,
			collectionPath: "integracoes_api",
			parentPath: null,
			data: data || {},
		}));
		if (!saved["sempre-playground-api"] && !saved.sempre) {
			entries.push({
				documentId: "sempre-playground-api",
				path: "integracoes_api/sempre-playground-api",
				collectionPath: "integracoes_api",
				parentPath: null,
				data: {
					name: "API Sempre Playground",
					provider: "Sempre / Playground",
					baseUrl: process.env.SEMPRE_API_BASE_URL || "https://playground.sempre.net.br/api",
					active: true,
					secretValue: "",
					refreshToken: "",
					loginEmail: "",
					loginPassword: "",
					sistemaId: process.env.SEMPRE_API_SISTEMA_ID || 6,
					timeoutMs: process.env.SEMPRE_API_TIMEOUT_MS || 15000,
				},
			});
		}
		return entries;
	}
	const { rows } = await db.query(
		`select path, collection_path, document_id, parent_path, data, created_at, updated_at
		from operacao_documents
		where collection_path = $1
		order by updated_at desc`,
		[String(collectionPath || "")],
	);
	return rows.map(documentFromRow);
}

async function upsertDocument({ path, collectionPath, documentId, parentPath = null, data = {} }) {
	const safeCollection = String(collectionPath || path?.split("/")?.slice(0, -1).join("/") || "");
	const safeDocumentId = String(documentId || path?.split("/")?.pop() || randomDocumentId());
	const safePath = String(path || `${safeCollection}/${safeDocumentId}`);
	if (collectionPath === "integracoes_api") {
		const { rows } = await db
			.query("select value from rot_settings where key = 'integrations' limit 1")
			.catch(() => ({ rows: [] }));
		const saved = rows[0]?.value || {};
		const provider = safeDocumentId || "sempre-playground-api";
		const nextSaved = { ...saved, [provider]: { ...(saved[provider] || {}), ...(data || {}) } };
		await db.query(
			`insert into rot_settings (key, value, updated_at)
			values ('integrations', $1::jsonb, now())
			on conflict (key) do update set value = excluded.value, updated_at = now()`,
			[JSON.stringify(nextSaved)],
		);
		return {
			path: `integracoes_api/${provider}`,
			collectionPath: "integracoes_api",
			documentId: provider,
			parentPath: null,
			data: nextSaved[provider],
		};
	}
	if (safeCollection === "acerto_estoque_acertos") {
		const lancamentos = Array.isArray(data.tecnicoLancamentos) && data.tecnicoLancamentos.length
			? data.tecnicoLancamentos
			: (Array.isArray(data.lancamentos) ? data.lancamentos : []);
		const first = lancamentos[0] || {};
		const tecnicoId = String(first.tecnicoId || data.tecnicoId || "").trim() || null;
		const empresaId = String(first.empresaId || data.empresaId || "").trim() || null;
		const regionalId = String(data.regionalId || "").trim() || null;
		const codigo = String(data.codigo || "").trim() || null;
		await db.query(
			`insert into operacao_acertos_estoque (
				id, empresa_id, tecnico_id, regional_id, codigo, data_acerto, status, itens, observacoes, source_payload
			)
			values ($1::uuid, $2::uuid, $3::uuid, $4, $5, coalesce($6::date, current_date), $7, $8::jsonb, $9, $10::jsonb)
			on conflict (id) do update set
				empresa_id = coalesce(excluded.empresa_id, operacao_acertos_estoque.empresa_id),
				tecnico_id = coalesce(excluded.tecnico_id, operacao_acertos_estoque.tecnico_id),
				regional_id = coalesce(excluded.regional_id, operacao_acertos_estoque.regional_id),
				codigo = excluded.codigo,
				data_acerto = excluded.data_acerto,
				status = excluded.status,
				itens = excluded.itens,
				observacoes = excluded.observacoes,
				source_payload = excluded.source_payload,
				updated_at = now()`,
			[
				safeDocumentId,
				empresaId,
				tecnicoId,
				regionalId,
				codigo,
				data.dataAcerto || data.date || null,
				data.status || "Registrado",
				JSON.stringify(lancamentos),
				data.observacoes || data.notes || "",
				JSON.stringify({
					cidade: data.cidade || "",
					turno: data.turno || "",
					tecnicoNomes: data.tecnicoNomes || lancamentos.map((item) => item.tecnicoNome).filter(Boolean),
					empresaNomes: data.empresaNomes || lancamentos.map((item) => item.empresaNome).filter(Boolean),
				}),
			],
		);
	}
	const { rows } = await db.query(
		`insert into operacao_documents (path, collection_path, document_id, parent_path, data)
		values ($1, $2, $3, $4, $5::jsonb)
		on conflict (path) do update set
			collection_path = excluded.collection_path,
			document_id = excluded.document_id,
			parent_path = excluded.parent_path,
			data = excluded.data,
			updated_at = now()
		returning path, collection_path, document_id, parent_path, data, created_at, updated_at`,
		[safePath, safeCollection, safeDocumentId, parentPath, JSON.stringify(data || {})],
	);
	return documentFromRow(rows[0]);
}

async function deleteDocument(path) {
	if (String(path || "").startsWith("integracoes_api/")) {
		const provider = String(path).split("/").pop();
		const { rows } = await db
			.query("select value from rot_settings where key = 'integrations' limit 1")
			.catch(() => ({ rows: [] }));
		const saved = rows[0]?.value || {};
		const nextSaved = { ...saved };
		delete nextSaved[provider];
		await db.query(
			`insert into rot_settings (key, value, updated_at)
			values ('integrations', $1::jsonb, now())
			on conflict (key) do update set value = excluded.value, updated_at = now()`,
			[JSON.stringify(nextSaved)],
		);
		return { ok: true };
	}
	await db.query(`delete from operacao_documents where path = $1`, [String(path || "")]);
	return { ok: true };
}

module.exports = {
	deleteDocument,
	getDocument,
	listAllDocuments,
	upsertDocument,
};
