const express = require("express");
const db = require("../db");
const {
	requireRegionalOwnership,
	requireRotAuth,
	requireRotPermission,
	scopeRegionalFilter,
} = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

const OPERATION_TYPES = new Set(["ROT", "FIELD", "DELIVERY"]);

function text(value) {
	return String(value ?? "").trim();
}

function slugify(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function normalizeStatus(value) {
	return text(value).toLowerCase().startsWith("inat") ? "Inativa" : "Ativa";
}

function normalizeAtuacao(value) {
	const key = text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (key === "ativacao") return "Ativacao";
	if (key === "manutencao") return "Manutencao";
	return "Ambos";
}

function normalizeList(input) {
	return [...new Set((Array.isArray(input) ? input : []).map((item) => text(item)).filter(Boolean))];
}

function normalizeScopes(input) {
	const clean = normalizeList(input).map((item) => item.toUpperCase()).filter((item) => OPERATION_TYPES.has(item));
	return clean.length ? clean : ["ROT"];
}

function publicCompany(row) {
	return {
		id: String(row.id),
		name: row.nome,
		cnpj: row.cnpj || "",
		slug: row.slug || slugify(row.nome),
		logoUrl: row.logo_url || "",
		status: row.status,
		atuacao: row.atuacao,
		authorizedAgent: row.agente_autorizado === true,
		responsible: {
			name: row.responsavel_nome || "",
			email: row.responsavel_email || "",
		},
		notes: row.observacoes || "",
		regionalIds: Array.isArray(row.regional_ids) ? row.regional_ids : [],
		regionalNames: Array.isArray(row.regional_names) ? row.regional_names : [],
		agentIds: Array.isArray(row.agent_ids) ? row.agent_ids.map(String) : [],
		agentNames: Array.isArray(row.agent_names) ? row.agent_names : [],
		operationScopes: Array.isArray(row.operation_scopes) && row.operation_scopes.length ? row.operation_scopes : ["ROT"],
		technicians: Array.isArray(row.technicians) ? row.technicians : [],
		techniciansCount: Number(row.technicians_count || 0),
		deliveryCount: Number(row.delivery_count || 0),
		fieldCount: Number(row.field_count || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// Resolver para requireRegionalOwnership (SEC-002): empresa e N:N com
// regional (operacao_empresa_regionais), diferente de tecnico/ticket/chave
// que tem coluna direta regional_id. Usuario regional so acessa se a
// propria regional estiver entre as regionais vinculadas a empresa.
async function getCompanyRegionalIds(req) {
	const id = text(req.params.id);
	const { rows: exists } = await db.query(
		`select id from operacao_empresas where id = $1 limit 1`,
		[id],
	);
	if (!exists[0]) return null;
	const { rows } = await db.query(
		`select regional_id from operacao_empresa_regionais where empresa_id = $1`,
		[id],
	);
	return rows.map((row) => row.regional_id);
}

// SEC-002: usuario regional so pode vincular a propria regional a uma
// empresa — nunca uma regional arbitraria enviada no payload. Global pode
// vincular quantas quiser.
function scopeRegionalIdsForRequest(req, requestedIds) {
	if (req.rotUser.is_global) return requestedIds;
	return [req.rotUser.regional_id];
}

async function loadCompany(client, id) {
	const { rows } = await client.query(
		`select
			e.id,
			e.nome,
			e.cnpj,
			e.slug,
			e.logo_url,
			e.status,
			e.atuacao,
			e.agente_autorizado,
			e.responsavel_nome,
			e.responsavel_email,
			e.observacoes,
			e.created_at,
			e.updated_at,
			coalesce(array_remove(array_agg(distinct er.regional_id), null), array[]::text[]) as regional_ids,
			coalesce(array_remove(array_agg(distinct r.nome), null), array[]::text[]) as regional_names,
			coalesce(array_remove(array_agg(distinct ea.agente_id::text), null), array[]::text[]) as agent_ids,
			coalesce(array_remove(array_agg(distinct a.cidade_nome), null), array[]::text[]) as agent_names,
			coalesce(array_remove(array_agg(distinct os.operation_type), null), array[]::text[]) as operation_scopes,
			coalesce(tech.technicians, '[]'::jsonb) as technicians,
			coalesce(tech.technicians_count, 0) as technicians_count,
			coalesce(tech.delivery_count, 0) as delivery_count,
			coalesce(tech.field_count, 0) as field_count
		   from operacao_empresas e
		   left join operacao_empresa_regionais er on er.empresa_id = e.id
		   left join regionais r on r.id = er.regional_id
		   left join operacao_empresa_agentes ea on ea.empresa_id = e.id
		   left join operacao_agentes a on a.id = ea.agente_id
		   left join operacao_empresa_operation_scopes os on os.empresa_id = e.id
		   left join lateral (
		   	select
		   		jsonb_agg(jsonb_build_object(
		   			'id', t.id,
		   			'name', t.nome,
		   			'email', coalesce(t.email, ''),
		   			'phone', coalesce(t.telefone, ''),
		   			'cityName', coalesce(t.cidade_nome, ''),
		   			'operationalArea', t.area_operacional,
		   			'operationScopes', coalesce(scope.operation_scopes, '[]'::jsonb),
		   			'regionalName', coalesce(tr.nome, '')
		   		) order by lower(t.nome)) as technicians,
		   		count(*)::int as technicians_count,
		   		count(*) filter (where coalesce(scope.operation_types, case when t.area_operacional = 'delivery' then array['DELIVERY']::text[] else array[]::text[] end) && array['DELIVERY']::text[])::int as delivery_count,
		   		count(*) filter (where coalesce(scope.operation_types, case when t.area_operacional = 'field_service' then array['FIELD']::text[] else array[]::text[] end) && array['FIELD']::text[])::int as field_count
		   	from operacao_tecnicos t
		   	left join regionais tr on tr.id = t.regional_id
		   	left join lateral (
		   		select
		   			array_remove(array_agg(s.operation_type order by s.operation_type), null) as operation_types,
		   			coalesce(jsonb_agg(s.operation_type order by s.operation_type) filter (where s.operation_type is not null), '[]'::jsonb) as operation_scopes
		   		from operacao_tecnico_operation_scopes s
		   		where s.tecnico_id = t.id
		   	) scope on true
		   	where t.empresa_id = e.id and t.status = 'Ativo'
		   ) tech on true
		  where e.id = $1
		  group by e.id, tech.technicians, tech.technicians_count, tech.delivery_count, tech.field_count`,
		[id],
	);
	return rows[0] || null;
}

async function replaceRelations(client, table, companyId, column, values, userId) {
	await client.query(`delete from ${table} where empresa_id = $1`, [companyId]);
	const clean = normalizeList(values);
	if (!clean.length) return;
	const rows = clean.map((_, index) => `($1, $${index + 2}, $${clean.length + 2})`).join(", ");
	await client.query(
		`insert into ${table} (empresa_id, ${column}, created_by)
		 values ${rows}
		 on conflict do nothing`,
		[companyId, ...clean, userId || null],
	);
}

async function replaceScopes(client, companyId, scopes, userId) {
	await replaceRelations(client, "operacao_empresa_operation_scopes", companyId, "operation_type", normalizeScopes(scopes), userId);
}

async function assertRegionalsExist(client, ids) {
	const clean = normalizeList(ids);
	if (!clean.length) return;
	const { rows } = await client.query(`select count(*)::int as total from regionais where id = any($1::text[]) and ativo = true`, [clean]);
	if (rows[0]?.total !== clean.length) throw Object.assign(new Error("Regional inválida informada."), { status: 400 });
}

async function assertAgentsExist(client, ids) {
	const clean = normalizeList(ids);
	if (!clean.length) return;
	const { rows } = await client.query(`select count(*)::int as total from operacao_agentes where id::text = any($1::text[]) and ativo = true`, [clean]);
	if (rows[0]?.total !== clean.length) throw Object.assign(new Error("Agente inválido informado."), { status: 400 });
}

router.get("/", requireRotPermission(["rot.companies.view", "rot.companies.manage"]), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			`select
				e.id,
				e.nome,
				e.cnpj,
				e.slug,
				e.logo_url,
				e.status,
				e.atuacao,
				e.agente_autorizado,
				e.responsavel_nome,
				e.responsavel_email,
				e.observacoes,
				e.created_at,
				e.updated_at,
				coalesce(array_remove(array_agg(distinct er.regional_id), null), array[]::text[]) as regional_ids,
				coalesce(array_remove(array_agg(distinct r.nome), null), array[]::text[]) as regional_names,
				coalesce(array_remove(array_agg(distinct ea.agente_id::text), null), array[]::text[]) as agent_ids,
				coalesce(array_remove(array_agg(distinct a.cidade_nome), null), array[]::text[]) as agent_names,
				coalesce(array_remove(array_agg(distinct os.operation_type), null), array[]::text[]) as operation_scopes,
				coalesce(tech.technicians, '[]'::jsonb) as technicians,
				coalesce(tech.technicians_count, 0) as technicians_count,
				coalesce(tech.delivery_count, 0) as delivery_count,
				coalesce(tech.field_count, 0) as field_count
			   from operacao_empresas e
			   left join operacao_empresa_regionais er on er.empresa_id = e.id
			   left join regionais r on r.id = er.regional_id
			   left join operacao_empresa_agentes ea on ea.empresa_id = e.id
			   left join operacao_agentes a on a.id = ea.agente_id
			   left join operacao_empresa_operation_scopes os on os.empresa_id = e.id
			   left join lateral (
			   	select
			   		jsonb_agg(jsonb_build_object(
			   			'id', t.id,
			   			'name', t.nome,
			   			'email', coalesce(t.email, ''),
			   			'phone', coalesce(t.telefone, ''),
			   			'cityName', coalesce(t.cidade_nome, ''),
			   			'operationalArea', t.area_operacional,
			   			'operationScopes', coalesce(scope.operation_scopes, '[]'::jsonb),
			   			'regionalName', coalesce(tr.nome, '')
			   		) order by lower(t.nome)) as technicians,
			   		count(*)::int as technicians_count,
			   		count(*) filter (where coalesce(scope.operation_types, case when t.area_operacional = 'delivery' then array['DELIVERY']::text[] else array[]::text[] end) && array['DELIVERY']::text[])::int as delivery_count,
			   		count(*) filter (where coalesce(scope.operation_types, case when t.area_operacional = 'field_service' then array['FIELD']::text[] else array[]::text[] end) && array['FIELD']::text[])::int as field_count
			   	from operacao_tecnicos t
			   	left join regionais tr on tr.id = t.regional_id
			   	left join lateral (
			   		select
			   			array_remove(array_agg(s.operation_type order by s.operation_type), null) as operation_types,
			   			coalesce(jsonb_agg(s.operation_type order by s.operation_type) filter (where s.operation_type is not null), '[]'::jsonb) as operation_scopes
			   		from operacao_tecnico_operation_scopes s
			   		where s.tecnico_id = t.id
			   	) scope on true
			   	where t.empresa_id = e.id and t.status = 'Ativo'
			   ) tech on true
			  where e.status = 'Ativa'
			    ${regionalScope ? "and exists (select 1 from operacao_empresa_regionais er2 where er2.empresa_id = e.id and er2.regional_id = $1)" : ""}
			  group by e.id, tech.technicians, tech.technicians_count, tech.delivery_count, tech.field_count
			  order by lower(e.nome)`,
			regionalScope ? [regionalScope] : [],
		);
		res.json({ ok: true, items: rows.map(publicCompany) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.companies.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const name = text(req.body?.name || req.body?.nome);
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome da empresa." });
			return;
		}
		const regionalIds = scopeRegionalIdsForRequest(req, normalizeList(req.body?.regionalIds));
		const agentIds = normalizeList(req.body?.agentIds);
		await client.query("begin");
		await assertRegionalsExist(client, regionalIds);
		await assertAgentsExist(client, agentIds);
		const { rows } = await client.query(
			`insert into operacao_empresas (
				nome, cnpj, slug, logo_url, status, atuacao, agente_autorizado,
				responsavel_nome, responsavel_email, observacoes, source_payload, created_by, updated_by
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $12)
			returning id`,
			[
				name,
				text(req.body?.cnpj) || null,
				text(req.body?.slug) || slugify(name),
				text(req.body?.logoUrl) || null,
				normalizeStatus(req.body?.status),
				normalizeAtuacao(req.body?.atuacao),
				req.body?.authorizedAgent === true,
				text(req.body?.responsible?.name) || null,
				text(req.body?.responsible?.email) || null,
				text(req.body?.notes) || null,
				JSON.stringify({ origem: "operacao" }),
				req.user?.id || null,
			],
		);
		await replaceRelations(client, "operacao_empresa_regionais", rows[0].id, "regional_id", regionalIds, req.user?.id);
		await replaceRelations(client, "operacao_empresa_agentes", rows[0].id, "agente_id", agentIds, req.user?.id);
		await replaceScopes(client, rows[0].id, req.body?.operationScopes, req.user?.id);
		const company = await loadCompany(client, rows[0].id);
		await client.query("commit");
		res.json({ ok: true, company: publicCompany(company) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (error?.constraint === "idx_operacao_empresas_nome_unique") {
			res.status(409).json({ ok: false, error: "Já existe empresa ativa com esse nome." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.put("/:id", requireRotPermission("rot.companies.manage"), requireRegionalOwnership(getCompanyRegionalIds, { notFoundMessage: "Empresa não encontrada." }), async (req, res, next) => {
	const client = await db.connect();
	try {
		const companyId = text(req.params.id);
		const name = text(req.body?.name || req.body?.nome);
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome da empresa." });
			return;
		}
		const regionalIds = scopeRegionalIdsForRequest(req, normalizeList(req.body?.regionalIds));
		const agentIds = normalizeList(req.body?.agentIds);
		await client.query("begin");
		const current = await loadCompany(client, companyId);
		if (!current) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Empresa não encontrada." });
			return;
		}
		await assertRegionalsExist(client, regionalIds);
		await assertAgentsExist(client, agentIds);
		await client.query(
			`update operacao_empresas
			    set nome = $2,
			        cnpj = $3,
			        slug = $4,
			        logo_url = $5,
			        status = $6,
			        atuacao = $7,
			        agente_autorizado = $8,
			        responsavel_nome = $9,
			        responsavel_email = $10,
			        observacoes = $11,
			        updated_by = $12,
			        updated_at = now()
			  where id = $1`,
			[
				companyId,
				name,
				text(req.body?.cnpj) || null,
				text(req.body?.slug) || slugify(name),
				text(req.body?.logoUrl) || null,
				normalizeStatus(req.body?.status),
				normalizeAtuacao(req.body?.atuacao),
				req.body?.authorizedAgent === true,
				text(req.body?.responsible?.name) || null,
				text(req.body?.responsible?.email) || null,
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		await replaceRelations(client, "operacao_empresa_regionais", companyId, "regional_id", regionalIds, req.user?.id);
		await replaceRelations(client, "operacao_empresa_agentes", companyId, "agente_id", agentIds, req.user?.id);
		await replaceScopes(client, companyId, req.body?.operationScopes, req.user?.id);
		const company = await loadCompany(client, companyId);
		await client.query("commit");
		res.json({ ok: true, company: publicCompany(company) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (error?.constraint === "idx_operacao_empresas_nome_unique") {
			res.status(409).json({ ok: false, error: "Já existe empresa ativa com esse nome." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.delete("/:id", requireRotPermission("rot.companies.manage"), requireRegionalOwnership(getCompanyRegionalIds, { notFoundMessage: "Empresa não encontrada." }), async (req, res, next) => {
	try {
		const { rowCount } = await db.query(
			`update operacao_empresas
			    set status = 'Inativa',
			        updated_by = $2,
			        updated_at = now()
			  where id = $1
			    and status = 'Ativa'`,
			[text(req.params.id), req.user?.id || null],
		);
		if (!rowCount) {
			res.status(404).json({ ok: false, error: "Empresa não encontrada." });
			return;
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
