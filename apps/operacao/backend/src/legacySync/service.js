const crypto = require("node:crypto");
const { Pool } = require("pg");
const db = require("../db");
const { buildPgSslConfig } = require("../security/pgSsl");

const COLLECTIONS = {
	regionals: "regionais",
	agents: "agentes",
	companies: "empresas_tecnicos",
	stockProducts: "acerto_estoque_produtos",
	stockAdjustments: "acerto_estoque_acertos",
	deliveries: "entregas_tecnicos",
};

function text(value) {
	return String(value ?? "").trim();
}

function normalizeText(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function canonicalRegionalName(value) {
	const clean = text(value)
		.replace(/^regional\s*\|\s*/i, "")
		.replace(/\bsub[\s-]*(\d)\b/gi, "SUB$1")
		.replace(/\s+/g, " ")
		.trim();
	return clean || text(value);
}

function slugify(value, fallback = "item") {
	return normalizeText(value || fallback)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || fallback;
}

function stableId(prefix, value) {
	return `${prefix}-${slugify(value, crypto.createHash("sha1").update(String(value || prefix)).digest("hex").slice(0, 10))}`;
}

function normalizeList(input) {
	if (Array.isArray(input)) return [...new Set(input.map(text).filter(Boolean))];
	return [...new Set(String(input || "").split(/[,\n;]/).map(text).filter(Boolean))];
}

function normalizeAtuacao(value) {
	const key = normalizeText(value);
	if (key === "ativacao") return "Ativacao";
	if (key === "manutencao") return "Manutencao";
	return "Ambos";
}

function normalizeArea(value) {
	const key = normalizeText(value).replace(/[\s-]+/g, "_");
	if (key.includes("field") || key.includes("manut")) return "field_service";
	if (key === "rot") return "rot";
	return "delivery";
}

function normalizeScopesFromAtuacao(value) {
	const atuacao = normalizeAtuacao(value);
	if (atuacao === "Ativacao") return ["DELIVERY"];
	if (atuacao === "Manutencao") return ["FIELD"];
	return ["ROT", "FIELD", "DELIVERY"];
}

async function tableExists(client, table) {
	const { rows } = await client.query("select to_regclass($1) as name", [`public.${table}`]);
	return Boolean(rows[0]?.name);
}

async function listLegacy(client, collectionPath) {
	if (!(await tableExists(client, "app_documents"))) return [];
	const { rows } = await client.query(
		`select path, collection_path as "collectionPath", document_id as "documentId", data, updated_at as "updatedAt"
		   from app_documents
		  where collection_path = $1
		  order by document_id`,
		[collectionPath],
	);
	return rows.map((row) => ({ ...row, data: row.data || {} }));
}

function buildLegacyDbConfig() {
	if (process.env.RETIRADAS_DATABASE_URL || process.env.OPERACAO_LEGACY_DATABASE_URL) {
		return {
			connectionString: process.env.RETIRADAS_DATABASE_URL || process.env.OPERACAO_LEGACY_DATABASE_URL,
			ssl: buildPgSslConfig({
				sslMode: process.env.RETIRADAS_PGSSLMODE || process.env.OPERACAO_LEGACY_PGSSLMODE,
				rejectUnauthorized: process.env.RETIRADAS_PG_SSL_REJECT_UNAUTHORIZED || process.env.OPERACAO_LEGACY_PG_SSL_REJECT_UNAUTHORIZED,
				ca: process.env.RETIRADAS_PG_SSL_CA || process.env.OPERACAO_LEGACY_PG_SSL_CA,
			}),
		};
	}
	const host = process.env.RETIRADAS_PGHOST || process.env.OPERACAO_LEGACY_PGHOST;
	const user = process.env.RETIRADAS_PGUSER || process.env.OPERACAO_LEGACY_PGUSER;
	const database = process.env.RETIRADAS_PGDATABASE || process.env.OPERACAO_LEGACY_PGDATABASE;
	if (!host || !user || !database) return null;
	return {
		host,
		port: Number(process.env.RETIRADAS_PGPORT || process.env.OPERACAO_LEGACY_PGPORT || 5432),
		user,
		password: process.env.RETIRADAS_PGPASSWORD || process.env.OPERACAO_LEGACY_PGPASSWORD,
		database,
		ssl: buildPgSslConfig({
			sslMode: process.env.RETIRADAS_PGSSLMODE || process.env.OPERACAO_LEGACY_PGSSLMODE,
			rejectUnauthorized: process.env.RETIRADAS_PG_SSL_REJECT_UNAUTHORIZED || process.env.OPERACAO_LEGACY_PG_SSL_REJECT_UNAUTHORIZED,
			ca: process.env.RETIRADAS_PG_SSL_CA || process.env.OPERACAO_LEGACY_PG_SSL_CA,
		}),
	};
}

async function withLegacySource(targetClient, callback) {
	const config = buildLegacyDbConfig();
	if (!config) return callback(targetClient);
	const pool = new Pool({ ...config, max: 2, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000 });
	const legacyClient = await pool.connect();
	try {
		return await callback(legacyClient);
	} finally {
		legacyClient.release();
		await pool.end().catch(() => {});
	}
}

async function findRegionalIdByName(client, name) {
	const clean = text(name);
	if (!clean) return null;
	const { rows } = await client.query(`select id from regionais where lower(nome) = lower($1) limit 1`, [clean]);
	return rows[0]?.id || null;
}

async function ensureRegional(client, name, source = {}) {
	const clean = canonicalRegionalName(name);
	if (!clean) return null;
	const existing = await findRegionalIdByName(client, clean);
	if (existing) return existing;
	const id = stableId("regional", clean);
	await client.query(
		`insert into regionais (id, nome, ativo, legacy_path, legacy_document_id, source_payload)
		 values ($1, $2, true, $3, $4, $5::jsonb)
		 on conflict (id) do update set nome = excluded.nome, ativo = true, updated_at = now()`,
		[id, clean, source.path || null, source.documentId || null, JSON.stringify(source.data || {})],
	);
	await client.query(`insert into regional_operation_scopes (regional_id, operation_type) values ($1, 'ROT') on conflict do nothing`, [id]);
	return id;
}

async function ensureCity(client, regionalId, name, source = {}) {
	const clean = text(name);
	if (!regionalId || !clean) return null;
	const payload = {
		...(source.data || {}),
		legacyPath: source.path || null,
		legacyDocumentId: source.documentId || null,
	};
	const { rows } = await client.query(
		`insert into regional_cidades (regional_id, nome, tipo, legacy_path, legacy_document_id, source_payload)
		 values ($1, $2, $3, $4, $5, $6::jsonb)
		 on conflict (regional_id, lower(nome)) do update set
			tipo = coalesce(excluded.tipo, regional_cidades.tipo),
			legacy_path = coalesce(excluded.legacy_path, regional_cidades.legacy_path),
			legacy_document_id = coalesce(excluded.legacy_document_id, regional_cidades.legacy_document_id),
			source_payload = excluded.source_payload,
			updated_at = now()
		 returning id`,
		[regionalId, clean, text(source.tipo) || null, source.path || null, source.documentId || null, JSON.stringify(payload)],
	);
	return rows[0]?.id || null;
}

async function findCompanyByLegacyOrName(client, legacyId, name) {
	const cleanName = text(name);
	const cleanLegacyId = text(legacyId);
	if (!cleanName && !cleanLegacyId) return null;
	const { rows } = await client.query(
		`select id, nome
		   from operacao_empresas
		  where ($1 <> '' and (source_payload->>'id' = $1 or legacy_path = $1 or legacy_path like '%' || $1 || '%'))
		     or ($2 <> '' and lower(nome) = lower($2))
		  order by case when $1 <> '' and (source_payload->>'id' = $1 or legacy_path like '%' || $1 || '%') then 0 else 1 end
		  limit 1`,
		[cleanLegacyId, cleanName],
	);
	return rows[0] || null;
}

async function findTechnicianByLegacyEmailOrName(client, legacyId, email, name) {
	const cleanLegacyId = text(legacyId);
	const cleanEmail = text(email).toLowerCase();
	const cleanName = text(name);
	if (!cleanLegacyId && !cleanEmail && !cleanName) return null;
	const { rows } = await client.query(
		`select id, nome, email, empresa_id, regional_id
		   from operacao_tecnicos
		  where ($1 <> '' and (source_payload->>'id' = $1 or legacy_path = $1 or legacy_path like '%' || $1 || '%'))
		     or ($2 <> '' and lower(coalesce(email, '')) = $2)
		     or ($3 <> '' and lower(nome) = lower($3))
		  order by
		  	case
		  		when $1 <> '' and (source_payload->>'id' = $1 or legacy_path like '%' || $1 || '%') then 0
		  		when $2 <> '' and lower(coalesce(email, '')) = $2 then 1
		  		else 2
		  	end
		  limit 1`,
		[cleanLegacyId, cleanEmail, cleanName],
	);
	return rows[0] || null;
}

async function replaceScopes(client, table, idColumn, id, scopes) {
	await client.query(`delete from ${table} where ${idColumn} = $1`, [id]);
	for (const scope of scopes.length ? scopes : ["ROT"]) {
		await client.query(
			`insert into ${table} (${idColumn}, operation_type) values ($1, $2) on conflict do nothing`,
			[id, scope],
		);
	}
}

async function syncRegionals(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.regionals);
	let regionals = 0;
	let cities = 0;
	for (const doc of docs) {
		const data = doc.data || {};
		const name = canonicalRegionalName(data.nome || data.name || doc.documentId);
		if (!name) continue;
		const regionalId = (await findRegionalIdByName(client, name)) || stableId("regional", name);
		await client.query(
			`insert into regionais (id, nome, ativo, legacy_path, legacy_document_id, source_payload)
			 values ($1, $2, true, $3, $4, $5::jsonb)
			 on conflict (id) do update set
				nome = excluded.nome,
				ativo = true,
				legacy_path = excluded.legacy_path,
				legacy_document_id = excluded.legacy_document_id,
				source_payload = excluded.source_payload,
				updated_at = now()`,
			[regionalId, name, doc.path, doc.documentId, JSON.stringify(data)],
		);
		await client.query(`insert into regional_operation_scopes (regional_id, operation_type) values ($1, 'ROT') on conflict do nothing`, [regionalId]);
		regionals += 1;
		const cityRows = Array.isArray(data.cidades) ? data.cidades : [];
		for (const city of cityRows) {
			const cityName = text(city?.nome || city?.cidade || city?.name || city);
			if (!cityName) continue;
			await ensureCity(client, regionalId, cityName, {
				path: `${doc.path}/cidades/${slugify(cityName)}`,
				documentId: `${doc.documentId}:${slugify(cityName)}`,
				tipo: city?.tipo,
				data: city,
			});
			cities += 1;
		}
	}
	return { regionals, cities };
}

async function syncAgents(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.agents);
	let agents = 0;
	for (const doc of docs) {
		const data = doc.data || {};
		const cityName = text(data.cidade || data.nome || data.name || doc.documentId);
		if (!cityName) continue;
		const regionalId = await ensureRegional(client, data.regional_nome || data.regional || data.regionalName || "Regional não informada", doc);
		const cityId = await ensureCity(client, regionalId, cityName, { path: doc.path, documentId: doc.documentId, tipo: "Agente Aut.", data });
		const responsavel = data.responsavel || {};
		const existing = await client.query(
			`select id
			   from operacao_agentes
			  where legacy_path = $1
			     or (regional_id = $2 and lower(cidade_nome) = lower($3) and ativo = true)
			  order by case when legacy_path = $1 then 0 else 1 end
			  limit 1`,
			[doc.path, regionalId, cityName],
		);
		const values = [
			cityId,
			regionalId,
			cityName,
			text(responsavel.nome || data.responsavel_nome || data.responsavel),
			text(responsavel.email || data.email || data.responsavel_email),
			text(responsavel.telefone || data.telefone || data.responsavel_telefone),
			doc.path,
			JSON.stringify(data),
		];
		const { rows } = existing.rows[0]
			? await client.query(
				`update operacao_agentes
				    set cidade_id = $1,
				        regional_id = $2,
				        cidade_nome = $3,
				        responsavel_nome = $4,
				        responsavel_email = $5,
				        responsavel_telefone = $6,
				        ativo = true,
				        legacy_path = $7,
				        source_payload = $8::jsonb,
				        updated_at = now()
				  where id = $9
				  returning id`,
				[...values, existing.rows[0].id],
			)
			: await client.query(
				`insert into operacao_agentes (cidade_id, regional_id, cidade_nome, responsavel_nome, responsavel_email, responsavel_telefone, ativo, legacy_path, source_payload)
				 values ($1, $2, $3, $4, $5, $6, true, $7, $8::jsonb)
				 returning id`,
			[
				...values,
			],
			);
		await replaceScopes(client, "operacao_agente_operation_scopes", "agente_id", rows[0].id, ["ROT", "DELIVERY"]);
		agents += 1;
	}
	return { agents };
}

async function upsertCompany(client, doc) {
	const data = doc.data || {};
	const name = text(data.nome || data.empresa || data.name || doc.documentId);
	if (!name) return null;
	const regionNames = normalizeList(data.regionais || data.regional);
	const regionalIds = [];
	for (const regionalName of regionNames) {
		const regionalId = await ensureRegional(client, regionalName, doc);
		if (regionalId) regionalIds.push(regionalId);
	}
	const responsavel = typeof data.responsavel === "object" ? data.responsavel : {};
	const existing = await client.query(
		`select id
		   from operacao_empresas
		  where legacy_path = $1
		     or (lower(nome) = lower($2) and status = 'Ativa')
		  order by case when legacy_path = $1 then 0 else 1 end
		  limit 1`,
		[doc.path, name],
	);
	const values = [
		name,
		text(data.cnpj || data.documento || data.cpfCnpj),
		text(data.slug) || slugify(name),
		text(data.logo || data.logoUrl),
		normalizeText(data.status).startsWith("inat") ? "Inativa" : "Ativa",
		normalizeAtuacao(data.atuacao || data.tipoAtuacao),
		Boolean(data.agenteAutorizado || data.agente_autorizado || data.isAgente),
		text(responsavel.nome || data.responsavel_nome || (typeof data.responsavel === "string" ? data.responsavel : "")),
		text(responsavel.email || data.email || data.emailResponsavel),
		text(data.observacoes),
		JSON.stringify(data),
		doc.path,
	];
	const { rows } = existing.rows[0]
		? await client.query(
			`update operacao_empresas
			    set nome = $1,
			        cnpj = $2,
			        slug = $3,
			        logo_url = $4,
			        status = $5,
			        atuacao = $6,
			        agente_autorizado = $7,
			        responsavel_nome = $8,
			        responsavel_email = $9,
			        observacoes = $10,
			        source_payload = $11::jsonb,
			        legacy_path = $12,
			        updated_at = now()
			  where id = $13
			  returning id`,
			[...values, existing.rows[0].id],
		)
		: await client.query(
			`insert into operacao_empresas (
				nome, cnpj, slug, logo_url, status, atuacao, agente_autorizado,
				responsavel_nome, responsavel_email, observacoes, source_payload, legacy_path
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
			returning id`,
		[
			...values,
		],
		);
	const companyId = rows[0].id;
	await client.query(`delete from operacao_empresa_regionais where empresa_id = $1`, [companyId]);
	for (const regionalId of regionalIds) {
		await client.query(`insert into operacao_empresa_regionais (empresa_id, regional_id) values ($1, $2) on conflict do nothing`, [companyId, regionalId]);
	}
	await replaceScopes(client, "operacao_empresa_operation_scopes", "empresa_id", companyId, normalizeScopesFromAtuacao(data.atuacao || data.tipoAtuacao));
	return { companyId, data, name, regionalIds };
}

async function syncCompaniesAndTechnicians(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.companies);
	let companies = 0;
	let technicians = 0;
	for (const doc of docs) {
		const company = await upsertCompany(client, doc);
		if (!company) continue;
		companies += 1;
		const tecnicos = Array.isArray(company.data.tecnicos) ? company.data.tecnicos : [];
		for (let index = 0; index < tecnicos.length; index += 1) {
			const tech = tecnicos[index] || {};
			const name = text(tech.nome || tech.name);
			if (!name) continue;
			const regionalId = company.regionalIds[0] || null;
			const cityName = text(tech.cidade);
			const cityId = regionalId && cityName ? await ensureCity(client, regionalId, cityName, { path: `${doc.path}/tecnicos/${index}`, documentId: `${doc.documentId}:tecnico:${index}`, data: tech }) : null;
			const legacyPath = `${doc.path}/tecnicos/${text(tech.id) || index}`;
			const { rows } = await client.query(
				`insert into operacao_tecnicos (
					empresa_id, regional_id, cidade_id, nome, email, telefone, cidade_nome,
					area_operacional, status, observacoes, source_payload, legacy_path
				)
				values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
				on conflict (legacy_path) where legacy_path is not null do update set
					empresa_id = excluded.empresa_id,
					regional_id = excluded.regional_id,
					cidade_id = excluded.cidade_id,
					nome = excluded.nome,
					email = excluded.email,
					telefone = excluded.telefone,
					cidade_nome = excluded.cidade_nome,
					area_operacional = excluded.area_operacional,
					status = excluded.status,
					observacoes = excluded.observacoes,
					source_payload = excluded.source_payload,
					updated_at = now()
				returning id`,
				[
					company.companyId,
					regionalId,
					cityId,
					name,
					text(tech.email || tech.emailHubsoft || tech.emailHubSoft),
					text(tech.telefone || tech.phone),
					cityName,
					normalizeArea(tech.areaOperacional || tech.area || tech.tipoAtendimento),
					normalizeText(tech.status).startsWith("inat") ? "Inativo" : "Ativo",
					text(tech.observacoes),
					JSON.stringify(tech),
					legacyPath,
				],
			);
			await replaceScopes(client, "operacao_tecnico_operation_scopes", "tecnico_id", rows[0].id, normalizeScopesFromAtuacao(tech.areaOperacional || company.data.atuacao));
			technicians += 1;
		}
	}
	return { companies, technicians };
}

async function syncStockAdjustments(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.stockAdjustments);
	let stockAdjustments = 0;
	for (const doc of docs) {
		const data = doc.data || {};
		const items = Array.isArray(data.tecnicoLancamentos) ? data.tecnicoLancamentos : Array.isArray(data.lancamentos) ? data.lancamentos : [];
		const enrichedItems = [];
		let primaryCompanyId = null;
		let primaryTechnicianId = null;
		let primaryRegionalId = null;
		for (const item of items) {
			const company = await findCompanyByLegacyOrName(client, item.empresaId || data.empresaId, item.empresaNome || data.empresaNome || data.empresaNomes?.[0]);
			const technician = await findTechnicianByLegacyEmailOrName(client, item.tecnicoId, item.tecnicoEmail, item.tecnicoNome || data.tecnicoNome);
			const regionalId = (text(data.regional) ? await ensureRegional(client, data.regional, doc) : null) || technician?.regional_id || null;
			if (!primaryCompanyId) primaryCompanyId = technician?.empresa_id || company?.id || null;
			if (!primaryTechnicianId) primaryTechnicianId = technician?.id || null;
			if (!primaryRegionalId) primaryRegionalId = regionalId;
			enrichedItems.push({
				...item,
				empresaId: technician?.empresa_id || company?.id || item.empresaId || "",
				empresaNome: company?.nome || item.empresaNome || data.empresaNome || "",
				tecnicoId: technician?.id || item.tecnicoId || "",
				tecnicoNome: technician?.nome || item.tecnicoNome || "",
				tecnicoEmail: technician?.email || item.tecnicoEmail || "",
			});
		}
		await client.query(
			`insert into operacao_acertos_estoque (empresa_id, tecnico_id, regional_id, codigo, data_acerto, status, itens, observacoes, legacy_path, source_payload)
			 values ($1::uuid, $2::uuid, $3, $4, coalesce($5::date, current_date), $6, $7::jsonb, $8, $9, $10::jsonb)
			 on conflict (legacy_path) where legacy_path is not null do update set
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
				primaryCompanyId,
				primaryTechnicianId,
				primaryRegionalId,
				text(data.codigo || doc.documentId),
				text(data.dataAcerto || data.data || data.date) || null,
				text(data.status) || "Registrado",
				JSON.stringify(enrichedItems.length ? enrichedItems : items),
				text(data.observacoes),
				doc.path,
				JSON.stringify(data),
			],
		);
		stockAdjustments += 1;
	}
	return { stockAdjustments };
}

async function syncStockProducts(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.stockProducts);
	let stockProducts = 0;
	for (const doc of docs) {
		const data = doc.data || {};
		const documentId = text(doc.documentId) || stableId("produto-acerto", doc.path);
		const path = `${COLLECTIONS.stockProducts}/${documentId}`;
		await client.query(
			`insert into operacao_documents (path, collection_path, document_id, parent_path, data)
			 values ($1, $2, $3, null, $4::jsonb)
			 on conflict (path) do update set
				collection_path = excluded.collection_path,
				document_id = excluded.document_id,
				data = excluded.data,
				updated_at = now()`,
			[
				path,
				COLLECTIONS.stockProducts,
				documentId,
				JSON.stringify({
					...data,
					id: text(data.id) || documentId,
					nome: text(data.nome || data.name || data.descricao || data.produto || doc.documentId),
					categoria: text(data.categoria || data.category),
					unidade: text(data.unidade || data.unit) || "un",
					status: text(data.status) || "Ativo",
					legacyPath: doc.path,
					legacyDocumentId: doc.documentId,
				}),
			],
		);
		stockProducts += 1;
	}
	return { stockProducts };
}

async function syncDeliveries(client, sourceClient) {
	const docs = await listLegacy(sourceClient, COLLECTIONS.deliveries);
	let deliveries = 0;
	for (const doc of docs) {
		const data = doc.data || {};
		await client.query(
			`insert into operacao_entregas_tecnicos (data_entrega, tipo, status, itens, assinatura, observacoes, legacy_path, source_payload)
			 values (coalesce($1::date, current_date), $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)
			 on conflict (legacy_path) where legacy_path is not null do update set
				data_entrega = excluded.data_entrega,
				tipo = excluded.tipo,
				status = excluded.status,
				itens = excluded.itens,
				assinatura = excluded.assinatura,
				observacoes = excluded.observacoes,
				source_payload = excluded.source_payload,
				updated_at = now()`,
			[
				text(data.entrega || data.dataEntrega || data.data || data.date) || null,
				text(data.tipo) || "Entrega",
				text(data.status) || "Pendente",
				JSON.stringify(Array.isArray(data.itens) ? data.itens : [data].filter(Boolean)),
				text(data.assinatura || data.recebedor || data.tecnico),
				text(data.motivo || data.observacoes),
				doc.path,
				JSON.stringify(data),
			],
		);
		deliveries += 1;
	}
	return { deliveries };
}

async function syncLegacyOperationData() {
	const client = await db.connect();
	try {
		await client.query("begin");
		const result = await withLegacySource(client, async (sourceClient) => ({
			...(await syncRegionals(client, sourceClient)),
			...(await syncAgents(client, sourceClient)),
			...(await syncCompaniesAndTechnicians(client, sourceClient)),
			...(await syncStockProducts(client, sourceClient)),
			...(await syncStockAdjustments(client, sourceClient)),
			...(await syncDeliveries(client, sourceClient)),
		}));
		await client.query("commit");
		return result;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

module.exports = { syncLegacyOperationData };
