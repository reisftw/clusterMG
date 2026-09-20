const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

function text(value) {
	return String(value ?? "").trim();
}

function normalizeScopes(input) {
	const allowed = new Set(["ROT", "FIELD", "DELIVERY"]);
	const values = Array.isArray(input) ? input : ["ROT"];
	const clean = [...new Set(values.map((item) => text(item).toUpperCase()).filter((item) => allowed.has(item)))];
	return clean.length ? clean : ["ROT"];
}

function publicAgent(row) {
	return {
		id: String(row.id),
		cityId: row.cidade_id ? String(row.cidade_id) : null,
		cityName: row.cidade_nome,
		regionalId: row.regional_id,
		regionalName: row.regional_nome || "",
		responsible: {
			name: row.responsavel_nome || "",
			email: row.responsavel_email || "",
			phone: row.responsavel_telefone || "",
		},
		active: row.ativo !== false,
		operationScopes: Array.isArray(row.operation_scopes) && row.operation_scopes.length ? row.operation_scopes : ["ROT"],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function findRegional(client, id) {
	const { rows } = await client.query(
		`select id, nome
		   from regionais
		  where (id = $1 or legacy_document_id = $1)
		    and ativo = true
		  limit 1`,
		[id],
	);
	return rows[0] || null;
}

async function findCity(client, cityId, regionalId) {
	if (!cityId) return null;
	const { rows } = await client.query(
		`select id, regional_id, nome
		   from regional_cidades
		  where (id::text = $1 or legacy_document_id = $1)
		    and regional_id = $2
		  limit 1`,
		[cityId, regionalId],
	);
	return rows[0] || null;
}

async function replaceScopes(client, agentId, scopes, userId) {
	await client.query(`delete from operacao_agente_operation_scopes where agente_id = $1`, [agentId]);
	const clean = normalizeScopes(scopes);
	const values = clean.map((_, index) => `($1, $${index + 2}, $${clean.length + 2})`).join(", ");
	await client.query(
		`insert into operacao_agente_operation_scopes (agente_id, operation_type, created_by)
		 values ${values}
		 on conflict do nothing`,
		[agentId, ...clean, userId || null],
	);
}

async function loadAgent(client, id) {
	const { rows } = await client.query(
		`select
			a.id,
			a.cidade_id,
			a.regional_id,
			r.nome as regional_nome,
			a.cidade_nome,
			a.responsavel_nome,
			a.responsavel_email,
			a.responsavel_telefone,
			a.ativo,
			a.created_at,
			a.updated_at,
			coalesce(
				array_remove(array_agg(s.operation_type order by s.operation_type), null),
				array[]::text[]
			) as operation_scopes
		   from operacao_agentes a
		   join regionais r on r.id = a.regional_id
		   left join operacao_agente_operation_scopes s on s.agente_id = a.id
		  where a.id = $1
		  group by a.id, r.nome`,
		[id],
	);
	return rows[0] || null;
}

router.get("/", requireRotPermission(["rot.agents.view", "rot.agents.manage"]), noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select
				a.id,
				a.cidade_id,
				a.regional_id,
				r.nome as regional_nome,
				a.cidade_nome,
				a.responsavel_nome,
				a.responsavel_email,
				a.responsavel_telefone,
				a.ativo,
				a.created_at,
				a.updated_at,
				coalesce(
					array_remove(array_agg(s.operation_type order by s.operation_type), null),
					array[]::text[]
				) as operation_scopes
			   from operacao_agentes a
			   join regionais r on r.id = a.regional_id
			   left join operacao_agente_operation_scopes s on s.agente_id = a.id
			  where a.ativo = true
			  group by a.id, r.nome
			  order by lower(r.nome), lower(a.cidade_nome)`,
		);
		res.json({ ok: true, items: rows.map(publicAgent) });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.agents.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const regionalId = text(req.body?.regionalId);
		const cityId = text(req.body?.cityId);
		const typedCityName = text(req.body?.cityName || req.body?.cidade);
		const responsible = req.body?.responsible || {};
		await client.query("begin");
		const regional = await findRegional(client, regionalId);
		if (!regional) {
			await client.query("rollback");
			res.status(400).json({ ok: false, error: "Informe uma regional válida." });
			return;
		}
		const city = await findCity(client, cityId, regional.id);
		const cityName = text(city?.nome || typedCityName).toUpperCase();
		if (!cityName) {
			await client.query("rollback");
			res.status(400).json({ ok: false, error: "Informe a cidade do agente." });
			return;
		}
		const { rows } = await client.query(
			`insert into operacao_agentes (
				cidade_id, regional_id, cidade_nome, responsavel_nome,
				responsavel_email, responsavel_telefone, source_payload, created_by, updated_by
			)
			values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
			returning id`,
			[
				city?.id || null,
				regional.id,
				cityName,
				text(responsible.name || responsible.nome) || null,
				text(responsible.email) || null,
				text(responsible.phone || responsible.telefone) || null,
				JSON.stringify({ origem: "operacao", cidadeDigitada: typedCityName }),
				req.user?.id || null,
			],
		);
		await replaceScopes(client, rows[0].id, req.body?.operationScopes, req.user?.id);
		const agent = await loadAgent(client, rows[0].id);
		await client.query("commit");
		res.json({ ok: true, agent: publicAgent(agent) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (error?.constraint === "idx_operacao_agentes_regional_cidade_unique") {
			res.status(409).json({ ok: false, error: "Já existe agente ativo para essa cidade/regional." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.put("/:id", requireRotPermission("rot.agents.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const agentId = text(req.params.id);
		const regionalId = text(req.body?.regionalId);
		const cityId = text(req.body?.cityId);
		const typedCityName = text(req.body?.cityName || req.body?.cidade);
		const responsible = req.body?.responsible || {};
		await client.query("begin");
		const current = await loadAgent(client, agentId);
		if (!current) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Agente não encontrado." });
			return;
		}
		const regional = await findRegional(client, regionalId || current.regional_id);
		if (!regional) {
			await client.query("rollback");
			res.status(400).json({ ok: false, error: "Informe uma regional válida." });
			return;
		}
		const city = await findCity(client, cityId, regional.id);
		const cityName = text(city?.nome || typedCityName || current.cidade_nome).toUpperCase();
		if (!cityName) {
			await client.query("rollback");
			res.status(400).json({ ok: false, error: "Informe a cidade do agente." });
			return;
		}
		await client.query(
			`update operacao_agentes
			    set cidade_id = $2,
			        regional_id = $3,
			        cidade_nome = $4,
			        responsavel_nome = $5,
			        responsavel_email = $6,
			        responsavel_telefone = $7,
			        updated_by = $8,
			        updated_at = now()
			  where id = $1`,
			[
				agentId,
				city?.id || null,
				regional.id,
				cityName,
				text(responsible.name || responsible.nome) || null,
				text(responsible.email) || null,
				text(responsible.phone || responsible.telefone) || null,
				req.user?.id || null,
			],
		);
		await replaceScopes(client, agentId, req.body?.operationScopes, req.user?.id);
		const agent = await loadAgent(client, agentId);
		await client.query("commit");
		res.json({ ok: true, agent: publicAgent(agent) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (error?.constraint === "idx_operacao_agentes_regional_cidade_unique") {
			res.status(409).json({ ok: false, error: "Já existe agente ativo para essa cidade/regional." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.delete("/:id", requireRotPermission("rot.agents.manage"), async (req, res, next) => {
	try {
		const { rowCount } = await db.query(
			`update operacao_agentes
			    set ativo = false,
			        updated_by = $2,
			        updated_at = now()
			  where id = $1
			    and ativo = true`,
			[text(req.params.id), req.user?.id || null],
		);
		if (!rowCount) {
			res.status(404).json({ ok: false, error: "Agente não encontrado." });
			return;
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
