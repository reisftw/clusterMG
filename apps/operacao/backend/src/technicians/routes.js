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

function text(value) {
	return String(value ?? "").trim();
}

function normalizeList(input) {
	return [...new Set((Array.isArray(input) ? input : []).map((item) => text(item)).filter(Boolean))];
}

function normalizeArea(value) {
	const key = text(value).toLowerCase();
	if (key.includes("field") || key.includes("manut")) return "field_service";
	if (key === "rot") return "rot";
	return "delivery";
}

function normalizeScopes(input) {
	const allowed = new Set(["ROT", "FIELD", "DELIVERY"]);
	const clean = normalizeList(input).map((item) => item.toUpperCase()).filter((item) => allowed.has(item));
	return clean.length ? clean : ["ROT"];
}

function publicTech(row) {
	return {
		id: String(row.id),
		userId: row.user_id || "",
		companyId: row.empresa_id ? String(row.empresa_id) : "",
		companyName: row.empresa_nome || "",
		regionalId: row.regional_id || "",
		regionalName: row.regional_nome || "",
		cityId: row.cidade_id ? String(row.cidade_id) : "",
		name: row.nome,
		email: row.email || "",
		phone: row.telefone || "",
		cityName: row.cidade_nome || "",
		operationalArea: row.area_operacional,
		status: row.status,
		notes: row.observacoes || "",
		operationScopes: Array.isArray(row.operation_scopes) && row.operation_scopes.length ? row.operation_scopes : ["ROT"],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function replaceScopes(client, techId, scopes, userId) {
	await client.query(`delete from operacao_tecnico_operation_scopes where tecnico_id = $1`, [techId]);
	const clean = normalizeScopes(scopes);
	const values = clean.map((_, index) => `($1, $${index + 2}, $${clean.length + 2})`).join(", ");
	await client.query(
		`insert into operacao_tecnico_operation_scopes (tecnico_id, operation_type, created_by)
		 values ${values} on conflict do nothing`,
		[techId, ...clean, userId || null],
	);
}

// Resolver para requireRegionalOwnership (SEC-002): tecnico tem coluna
// direta regional_id (1:1, diferente de empresas que sao N:N).
async function getTechnicianRegionalIds(req) {
	const { rows } = await db.query(
		`select regional_id from operacao_tecnicos where id = $1 limit 1`,
		[text(req.params.id)],
	);
	if (!rows[0]) return null;
	return [rows[0].regional_id];
}

async function loadTech(client, id) {
	const { rows } = await client.query(
		`select
			t.*,
			e.nome as empresa_nome,
			r.nome as regional_nome,
			coalesce(array_remove(array_agg(s.operation_type order by s.operation_type), null), array[]::text[]) as operation_scopes
		   from operacao_tecnicos t
		   left join operacao_empresas e on e.id = t.empresa_id
		   left join regionais r on r.id = t.regional_id
		   left join operacao_tecnico_operation_scopes s on s.tecnico_id = t.id
		  where t.id = $1
		  group by t.id, e.nome, r.nome`,
		[id],
	);
	return rows[0] || null;
}

router.get("/", requireRotPermission(["rot.technicians.view", "rot.technicians.manage"]), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			`select
				t.*,
				e.nome as empresa_nome,
				r.nome as regional_nome,
				coalesce(array_remove(array_agg(s.operation_type order by s.operation_type), null), array[]::text[]) as operation_scopes
			   from operacao_tecnicos t
			   left join operacao_empresas e on e.id = t.empresa_id
			   left join regionais r on r.id = t.regional_id
			   left join operacao_tecnico_operation_scopes s on s.tecnico_id = t.id
			  where t.status = 'Ativo'
			    ${regionalScope ? "and t.regional_id = $1" : ""}
			  group by t.id, e.nome, r.nome
			  order by lower(t.nome)`,
			regionalScope ? [regionalScope] : [],
		);
		const { rows: users } = await db.query(
			`select id, name, email, phone, regional_id, city_id from rot_users where status = 'ativo' ${regionalScope ? "and regional_id = $1" : ""} order by name`,
			regionalScope ? [regionalScope] : [],
		);
		res.json({ ok: true, items: rows.map(publicTech), users });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.technicians.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const name = text(req.body?.name || req.body?.nome);
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome do técnico." });
			return;
		}
		// SEC-002: usuario regional nao pode cadastrar tecnico em outra
		// regional so trocando o campo no payload — a regional efetiva vem
		// sempre do proprio usuario autenticado quando ele nao e global.
		const regionalId = req.rotUser.is_global
			? text(req.body?.regionalId) || null
			: req.rotUser.regional_id;
		await client.query("begin");
		const { rows } = await client.query(
			`insert into operacao_tecnicos (
				user_id, empresa_id, regional_id, cidade_id, nome, email, telefone,
				cidade_nome, area_operacional, status, observacoes, created_by, updated_by
			)
			values ($1, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $12)
			returning id`,
			[
				text(req.body?.userId) || null,
				text(req.body?.companyId) || null,
				regionalId,
				text(req.body?.cityId) || null,
				name,
				text(req.body?.email) || null,
				text(req.body?.phone) || null,
				text(req.body?.cityName) || null,
				normalizeArea(req.body?.operationalArea),
				text(req.body?.status) || "Ativo",
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		await replaceScopes(client, rows[0].id, req.body?.operationScopes, req.user?.id);
		const tech = await loadTech(client, rows[0].id);
		await client.query("commit");
		res.json({ ok: true, technician: publicTech(tech) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client.release();
	}
});

router.put("/:id", requireRotPermission("rot.technicians.manage"), requireRegionalOwnership(getTechnicianRegionalIds, { notFoundMessage: "Técnico não encontrado." }), async (req, res, next) => {
	const client = await db.connect();
	try {
		const id = text(req.params.id);
		const name = text(req.body?.name || req.body?.nome);
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome do técnico." });
			return;
		}
		// SEC-002: usuario regional nao pode "mudar de regional" um tecnico
		// que ja e da propria regional (requireRegionalOwnership garante que
		// ele so chega aqui se o tecnico ja for da regional dele) — o campo
		// enviado no payload e ignorado nesse caso, so o usuario global pode
		// realocar um tecnico entre regionais.
		const regionalId = req.rotUser.is_global
			? text(req.body?.regionalId) || null
			: req.rotUser.regional_id;
		await client.query("begin");
		await client.query(
			`update operacao_tecnicos
			    set user_id = $2,
			        empresa_id = $3::uuid,
			        regional_id = $4,
			        cidade_id = $5::uuid,
			        nome = $6,
			        email = $7,
			        telefone = $8,
			        cidade_nome = $9,
			        area_operacional = $10,
			        status = $11,
			        observacoes = $12,
			        updated_by = $13,
			        updated_at = now()
			  where id = $1`,
			[
				id,
				text(req.body?.userId) || null,
				text(req.body?.companyId) || null,
				regionalId,
				text(req.body?.cityId) || null,
				name,
				text(req.body?.email) || null,
				text(req.body?.phone) || null,
				text(req.body?.cityName) || null,
				normalizeArea(req.body?.operationalArea),
				text(req.body?.status) || "Ativo",
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		await replaceScopes(client, id, req.body?.operationScopes, req.user?.id);
		const tech = await loadTech(client, id);
		await client.query("commit");
		res.json({ ok: true, technician: publicTech(tech) });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client.release();
	}
});

router.delete("/:id", requireRotPermission("rot.technicians.manage"), requireRegionalOwnership(getTechnicianRegionalIds, { notFoundMessage: "Técnico não encontrado." }), async (req, res, next) => {
	try {
		const { rowCount } = await db.query(
			`update operacao_tecnicos set status = 'Inativo', updated_by = $2, updated_at = now() where id = $1 and status = 'Ativo'`,
			[text(req.params.id), req.user?.id || null],
		);
		if (!rowCount) {
			res.status(404).json({ ok: false, error: "Técnico não encontrado." });
			return;
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
