const crypto = require("node:crypto");
const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const applyRegionais = args.has("--apply-regionais");
const writeJson = args.has("--json");

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

function lowerKey(value) {
	return text(value).toLowerCase();
}

function timestampValue(value) {
	if (!value) return null;
	if (typeof value === "object" && value.value) return timestampValue(value.value);
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// SHA-1 aqui NAO protege segredo nenhum — gera um UUID v5-like
// DETERMINISTICO a partir de uma chave de negocio (cidade, responsavel),
// pra idempotencia de migracao (mesmo seed -> mesmo id, evita duplicar
// registro ja existente). Trocar o algoritmo mudaria o id gerado pra
// registros que ja existem em producao (migration
// 030_regionais_usuarios_normalizacao.sql, ja aplicada), causando
// duplicidade em vez de atualizacao no proximo re-run. NAO alterar sem
// migrar os ids existentes primeiro.
function stableUuid(seed) {
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

function normalizeRegionalId(row) {
	const data = row.data || {};
	return text(data.id || row.document_id || row.documentId || row.path);
}

function normalizeRegional(row) {
	const data = row.data || {};
	const createdAt =
		timestampValue(data.criado_em) ||
		timestampValue(data.createdAt) ||
		timestampValue(row.imported_at) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizado_em) ||
		timestampValue(data.updatedAt) ||
		timestampValue(row.updated_at) ||
		createdAt;

	return {
		id: normalizeRegionalId(row),
		nome: text(data.nome || data.name || row.document_id),
		uf: nullableText(data.uf),
		ativo: data.ativo !== false,
		legacyPath: row.path,
		legacyDocumentId: row.document_id,
		createdAt,
		updatedAt,
		sourcePayload: data,
	};
}

function normalizeCidades(row, regionalId) {
	const data = row.data || {};
	const createdAt =
		timestampValue(data.criado_em) ||
		timestampValue(data.createdAt) ||
		timestampValue(row.imported_at) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizado_em) ||
		timestampValue(data.updatedAt) ||
		timestampValue(row.updated_at) ||
		createdAt;
	const rawCidades = Array.isArray(data.cidades) ? data.cidades : [];
	const cidades = rawCidades
		.map((cidade, index) => ({
			nome: text(cidade?.nome || cidade?.name || cidade),
			tipo: nullableText(cidade?.tipo || cidade?.type),
			index,
			sourcePayload: cidade,
		}))
		.filter((cidade) => cidade.nome);

	if (!cidades.length && text(data.cidade)) {
		cidades.push({
			nome: text(data.cidade),
			tipo: null,
			index: 0,
			sourcePayload: { nome: text(data.cidade), origem: "cidade" },
		});
	}

	const seen = new Set();
	return cidades.filter((cidade) => {
		const key = lowerKey(cidade.nome);
		if (seen.has(key)) return false;
		seen.add(key);
		cidade.id = stableUuid(`${row.path}:cidade:${key}`);
		cidade.regionalId = regionalId;
		cidade.legacyPath = `${row.path}/cidades/${cidade.index}`;
		cidade.legacyDocumentId = cidade.nome;
		cidade.createdAt = createdAt;
		cidade.updatedAt = updatedAt;
		return true;
	});
}

function personRecord(row, regionalId, tipo, person, legacySuffix, extraPayload = {}) {
	const nome = nullableText(person?.nome || person?.name);
	const email = nullableText(person?.email);
	const telefone = nullableText(person?.telefone || person?.phone);
	if (!nome && !email && !telefone) return null;

	const data = row.data || {};
	const createdAt =
		timestampValue(data.criado_em) ||
		timestampValue(data.createdAt) ||
		timestampValue(row.imported_at) ||
		new Date().toISOString();
	const updatedAt =
		timestampValue(data.atualizado_em) ||
		timestampValue(data.updatedAt) ||
		timestampValue(row.updated_at) ||
		createdAt;
	const identity = `${row.path}:responsavel:${tipo}:${legacySuffix}:${lowerKey(
		email || nome || telefone,
	)}`;

	return {
		id: stableUuid(identity),
		regionalId,
		tipo,
		nome,
		email,
		telefone,
		legacyPath: `${row.path}/responsaveis/${legacySuffix}`,
		legacyDocumentId: legacySuffix,
		createdAt,
		updatedAt,
		sourcePayload: {
			...extraPayload,
			...(person || {}),
		},
	};
}

function normalizeResponsaveis(row, regionalId) {
	const data = row.data || {};
	const responsaveis = [
		personRecord(row, regionalId, "lider", data.lider, "lider"),
		personRecord(row, regionalId, "supervisor", data.supervisor, "supervisor"),
		personRecord(row, regionalId, "backoffice", data.backoffice, "backoffice"),
	];

	(data.backoffices || []).forEach((person, index) => {
		responsaveis.push(
			personRecord(row, regionalId, "backoffice", person, `backoffices/${index}`),
		);
	});

	Object.entries(data.gruposOperacionais || {}).forEach(([groupKey, group]) => {
		if (!["delivery", "field_service"].includes(groupKey)) return;
		responsaveis.push(
			personRecord(row, regionalId, groupKey, group?.lider, `${groupKey}/lider`, {
				papelOperacional: "lider",
			}),
		);
		responsaveis.push(
			personRecord(
				row,
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
					row,
					regionalId,
					groupKey,
					person,
					`${groupKey}/backoffices/${index}`,
					{ papelOperacional: "backoffice" },
				),
			);
		});
	});

	const seen = new Set();
	return responsaveis.filter((responsavel) => {
		if (!responsavel) return false;
		const key = [
			responsavel.tipo,
			lowerKey(responsavel.email),
			lowerKey(responsavel.nome),
			lowerKey(responsavel.legacyDocumentId),
		].join("|");
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchRegionalDocuments(client) {
	const result = await client.query(
		`select path, document_id, data, imported_at, updated_at
		   from app_documents
		  where collection_path = 'regionais'
		  order by lower(coalesce(data->>'nome', document_id)), path`,
	);
	return result.rows;
}

async function fetchUserDivergenceReport(client) {
	const result = await client.query(
		`with usuario_docs as (
		   select
		     path,
		     document_id,
		     data,
		     lower(nullif(trim(data->>'email'), '')) as email_key,
		     nullif(trim(coalesce(data->>'nome', data->>'displayName', data->>'display_name')), '') as doc_nome,
		     nullif(trim(data->>'role'), '') as doc_role,
		     nullif(trim(data->>'regional'), '') as doc_regional,
		     nullif(trim(coalesce(data->>'empresaId', data->>'empresa_id')), '') as doc_empresa_id,
		     nullif(trim(coalesce(data->>'empresaNome', data->>'empresa_nome')), '') as doc_empresa_nome
		   from app_documents
		   where collection_path = 'usuarios'
		 ), joined as (
		   select
		     d.*,
		     u.uid as app_uid,
		     u.display_name as app_nome,
		     u.role as app_role,
		     u.regional as app_regional,
		     u.imported_profile,
		     coalesce(u.empresa_id, u.imported_profile->>'empresaId', u.imported_profile->>'empresa_id') as app_empresa_id,
		     coalesce(u.empresa_nome, u.imported_profile->>'empresaNome', u.imported_profile->>'empresa_nome') as app_empresa_nome
		   from usuario_docs d
		   left join app_users u on lower(u.email) = d.email_key
		 ), diffs as (
		   select
		     path,
		     document_id,
		     email_key as email,
		     app_uid,
		     doc_nome,
		     app_nome,
		     doc_role,
		     app_role,
		     doc_regional,
		     app_regional,
		     doc_empresa_id,
		     app_empresa_id,
		     doc_empresa_nome,
		     app_empresa_nome,
		     array_remove(array[
		       case when email_key is null then 'email_ausente' end,
		       case when email_key is not null and app_uid is null then 'sem_app_user_por_email' end,
		       case when app_uid is not null and coalesce(doc_nome,'') <> coalesce(app_nome,'') then 'nome' end,
		       case when app_uid is not null and coalesce(doc_role,'') <> coalesce(app_role,'') then 'role' end,
		       case when app_uid is not null and coalesce(doc_regional,'') <> coalesce(app_regional,'') then 'regional' end,
		       case when app_uid is not null and coalesce(doc_empresa_id,'') <> coalesce(app_empresa_id,'') then 'empresa_id' end,
		       case when app_uid is not null and coalesce(doc_empresa_nome,'') <> coalesce(app_empresa_nome,'') then 'empresa_nome' end
		     ], null) as campos_divergentes
		   from joined
		 )
		 select jsonb_build_object(
		   'geradoEm', now(),
		   'totais', jsonb_build_object(
		     'usuariosDocs', (select count(*) from usuario_docs),
		     'appUsers', (select count(*) from app_users),
		     'usuariosSemEmail', (select count(*) from usuario_docs where email_key is null),
		     'usuariosSemAppUserPorEmail', (select count(*) from diffs where 'sem_app_user_por_email' = any(campos_divergentes)),
		     'usuariosComDivergencia', (select count(*) from diffs where cardinality(campos_divergentes) > 0)
		   ),
		   'duplicidades', jsonb_build_object(
		     'emailsDuplicadosEmUsuarios', coalesce((select jsonb_agg(to_jsonb(e)) from (select email_key as email, count(*)::int as total, jsonb_agg(path order by path) as paths from usuario_docs where email_key is not null group by email_key having count(*) > 1 order by count(*) desc, email_key) e), '[]'::jsonb),
		     'documentIdsDuplicadosEmUsuarios', coalesce((select jsonb_agg(to_jsonb(i)) from (select document_id, count(*)::int as total, jsonb_agg(path order by path) as paths from usuario_docs group by document_id having count(*) > 1 order by count(*) desc, document_id) i), '[]'::jsonb)
		   ),
		   'divergencias', coalesce((select jsonb_agg(to_jsonb(d) order by email) from diffs d where cardinality(campos_divergentes) > 0), '[]'::jsonb)
		 ) as report`,
	);
	return result.rows[0]?.report || {};
}

async function migrateRegionais(client, documents) {
	let regionais = 0;
	let cidades = 0;
	let responsaveis = 0;

	await client.query("begin");
	try {
		for (const row of documents) {
			const regional = normalizeRegional(row);
			if (!regional.id || !regional.nome) continue;
			const insertedRegional = await client.query(
				`insert into regionais (
				   id, nome, uf, ativo, legacy_path, legacy_document_id,
				   created_at, updated_at, created_by, updated_by, source_payload
				 )
				 values ($1, $2, $3, $4, $5, $6, $7, $8, null, null, $9::jsonb)
				 on conflict (nome) do update set
				   uf = excluded.uf,
				   ativo = excluded.ativo,
				   legacy_path = excluded.legacy_path,
				   legacy_document_id = excluded.legacy_document_id,
				   source_payload = excluded.source_payload
				 returning id`,
				[
					regional.id,
					regional.nome,
					regional.uf,
					regional.ativo,
					regional.legacyPath,
					regional.legacyDocumentId,
					regional.createdAt,
					regional.updatedAt,
					JSON.stringify(regional.sourcePayload || {}),
				],
			);
			const regionalId = insertedRegional.rows[0].id;
			regionais += 1;

			await client.query("delete from regional_cidades where regional_id = $1", [
				regionalId,
			]);
			await client.query(
				"delete from regional_responsaveis where regional_id = $1",
				[regionalId],
			);

			for (const cidade of normalizeCidades(row, regionalId)) {
				await client.query(
					`insert into regional_cidades (
					   id, regional_id, nome, tipo, legacy_path, legacy_document_id,
					   created_at, updated_at, created_by, updated_by, source_payload
					 )
					 values ($1, $2, $3, $4, $5, $6, $7, $8, null, null, $9::jsonb)
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
						cidade.createdAt,
						cidade.updatedAt,
						JSON.stringify(cidade.sourcePayload || {}),
					],
				);
				cidades += 1;
			}

			for (const responsavel of normalizeResponsaveis(row, regionalId)) {
				await client.query(
					`insert into regional_responsaveis (
					   id, regional_id, tipo, nome, email, telefone, legacy_path,
					   legacy_document_id, created_at, updated_at, created_by,
					   updated_by, source_payload
					 )
					 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, null, null, $11::jsonb)
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
						responsavel.createdAt,
						responsavel.updatedAt,
						JSON.stringify(responsavel.sourcePayload || {}),
					],
				);
				responsaveis += 1;
			}
		}
		await client.query("commit");
		return { regionais, cidades, responsaveis };
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
			const regionalDocuments = await fetchRegionalDocuments(client);
			const normalized = regionalDocuments.map((row) => {
				const regional = normalizeRegional(row);
				return {
					regional,
					cidades: normalizeCidades(row, regional.id),
					responsaveis: normalizeResponsaveis(row, regional.id),
				};
			});

			const report = {
				mode: applyRegionais ? "apply-regionais" : "dry-run",
				regionais: {
					documentosOrigem: regionalDocuments.length,
					regionaisNormalizadas: normalized.filter((item) => item.regional.nome)
						.length,
					cidadesNormalizadas: normalized.reduce(
						(total, item) => total + item.cidades.length,
						0,
					),
					responsaveisNormalizados: normalized.reduce(
						(total, item) => total + item.responsaveis.length,
						0,
					),
				},
				usuarios: await fetchUserDivergenceReport(client),
			};

			if (applyRegionais) {
				report.regionais.aplicado = await migrateRegionais(
					client,
					regionalDocuments,
				);
			}

			const output = JSON.stringify(report, null, 2);
			if (writeJson) {
				process.stdout.write(`${output}\n`);
				return;
			}
			console.log("Migração Regionais / Usuários");
			console.log(`Modo: ${report.mode}`);
			console.log(JSON.stringify(report.regionais, null, 2));
			console.log("Relatório de divergências usuarios x app_users:");
			console.log(JSON.stringify(report.usuarios, null, 2));
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
