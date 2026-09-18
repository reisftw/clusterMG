const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

const RESPONSAVEL_TYPES = ["supervisor_rot", "supervisor_field"];
const OPERATIONAL_GROUPS = ["rot", "delivery", "field_service"];

function emptyPessoa() {
	return { nome: "", telefone: "", email: "" };
}

function normalizePessoa(pessoa = {}) {
	return {
		nome: String(pessoa?.nome || pessoa?.name || "").trim(),
		telefone: String(pessoa?.telefone || pessoa?.phone || "").trim(),
		email: String(pessoa?.email || "").trim(),
	};
}

function normalizePessoas(pessoas = []) {
	return (Array.isArray(pessoas) ? pessoas : [])
		.map(normalizePessoa)
		.filter((pessoa) => pessoa.nome || pessoa.telefone || pessoa.email);
}

function normalizeOperationalGroup(group = {}) {
	const backoffices = normalizePessoas(
		Array.isArray(group?.backoffices)
			? group.backoffices
			: group?.backoffice
				? [group.backoffice]
				: [],
	);
	return {
		lider: normalizePessoa(group?.lider),
		backoffices: backoffices.length ? backoffices : [emptyPessoa()],
		supervisor: normalizePessoa(group?.supervisor),
	};
}

function normalizeOperationalGroups(input = {}) {
	return OPERATIONAL_GROUPS.reduce((groups, key) => {
		groups[key] = normalizeOperationalGroup(input?.[key]);
		return groups;
	}, {});
}

function normalizeNameKey(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function sanitizeResponsaveis(input) {
	if (!Array.isArray(input)) return [];
	return input
		.filter((item) => RESPONSAVEL_TYPES.includes(item?.type))
		.map((item) => ({
			type: item.type,
			userId: item.userId ? String(item.userId) : null,
			cityId: item.cityId ? String(item.cityId) : null,
			phone: String(item.phone || "").trim(),
		}));
}

function canonicalResponsavelTipo(type) {
	return type === "supervisor_field" ? "field_service" : "supervisor";
}

function publicResponsavel(row) {
	const payload = row?.source_payload || {};
	const type =
		RESPONSAVEL_TYPES.includes(payload.type)
			? payload.type
			: row?.tipo === "field_service"
				? "supervisor_field"
				: "supervisor_rot";
	return {
		type,
		userId: payload.userId ? String(payload.userId) : null,
		cityId: payload.cityId ? String(payload.cityId) : null,
		phone: String(row?.telefone || payload.phone || "").trim(),
	};
}

function publicRegional(row, responsaveis = []) {
	const payload = row.source_payload || {};
	const gruposOperacionais = normalizeOperationalGroups(
		payload.gruposOperacionais || payload.grupos_operacionais || {},
	);
	return {
		id: row.id,
		name: row.nome,
		nome: row.nome,
		responsaveis,
		gruposOperacionais,
		grupos_operacionais: gruposOperacionais,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicCity(row) {
	const payload = row.source_payload || {};
	return {
		id: row.legacy_document_id || String(row.id),
		canonicalId: String(row.id),
		name: row.nome,
		nome: row.nome,
		tipo: row.tipo || payload.tipo || "Comum",
		type: row.tipo || payload.tipo || "Comum",
		regionalId: row.regional_id,
		code: row.code || null,
		lat: row.lat ?? payload.lat ?? null,
		lng: row.lng ?? payload.lng ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function duplicateRegionalName(error) {
	return error?.constraint === "idx_regionais_nome_unique" || error?.constraint === "rot_regionals_name_key";
}

function duplicateCityName(error) {
	return error?.constraint === "idx_regional_cidades_nome_unique";
}

function duplicateCityCode(error) {
	return error?.constraint === "ux_regional_cidades_upper_code";
}

function nullableCityCode(value) {
	const code = String(value || "").trim().toUpperCase().slice(0, 8);
	return code || null;
}

async function findRegional(client, id) {
	const { rows } = await client.query(
		`select id, nome, ativo, legacy_path, legacy_document_id, source_payload, created_at, updated_at
		   from regionais
		  where id = $1 or legacy_document_id = $1
		  limit 1`,
		[id],
	);
	return rows[0] || null;
}

async function findCity(client, cityId) {
	const { rows } = await client.query(
		`select id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at
		   from regional_cidades
		  where id::text = $1 or legacy_document_id = $1
		  limit 1`,
		[cityId],
	);
	return rows[0] || null;
}

async function findCityByNormalizedName(client, regionalId, name, ignoreId = null) {
	const target = normalizeNameKey(name);
	if (!target) return null;
	const { rows } = await client.query(
		`select id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at
		   from regional_cidades
		  where regional_id = $1
		  order by created_at nulls last, id`,
		[regionalId],
	);
	return rows.find((row) => {
		if (ignoreId && String(row.id) === String(ignoreId)) return false;
		return normalizeNameKey(row.nome) === target;
	}) || null;
}

async function insertRegionalResponsaveis(client, regionalId, responsaveis) {
	if (!responsaveis.length) return;
	const values = [];
	const params = [];
	responsaveis.forEach((item, index) => {
		const base = index * 5;
		values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`);
		params.push(
			regionalId,
			canonicalResponsavelTipo(item.type),
			item.phone || null,
			null,
			JSON.stringify({
				type: item.type,
				userId: item.userId,
				cityId: item.cityId,
				phone: item.phone,
				papelOperacional: "supervisor",
				legacyTable: "rot_regionals",
			}),
		);
	});
	await client.query(
		`insert into regional_responsaveis (regional_id, tipo, telefone, nome, source_payload)
		 values ${values.join(", ")}`,
		params,
	);
}

async function loadResponsaveis(client, regionalIds) {
	if (!regionalIds.length) return new Map();
	const { rows } = await client.query(
		`select regional_id, tipo, telefone, source_payload, created_at, updated_at
		   from regional_responsaveis
		  where regional_id = any($1::text[])
		  order by regional_id, tipo, created_at`,
		[regionalIds],
	);
	const byRegional = new Map();
	for (const row of rows) {
		if (!byRegional.has(row.regional_id)) byRegional.set(row.regional_id, []);
		const item = publicResponsavel(row);
		if (RESPONSAVEL_TYPES.includes(item.type)) byRegional.get(row.regional_id).push(item);
	}
	return byRegional;
}

async function loadCities(client, regionalIds) {
	if (!regionalIds.length) return new Map();
	const { rows } = await client.query(
		`select id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at
		   from regional_cidades
		  where regional_id = any($1::text[])
		  order by lower(nome), nome`,
		[regionalIds],
	);
	const byRegional = new Map();
	for (const row of rows) {
		if (!byRegional.has(row.regional_id)) byRegional.set(row.regional_id, []);
		byRegional.get(row.regional_id).push(publicCity(row));
	}
	return byRegional;
}

async function hydrateRegionals(client, regionais) {
	const ids = regionais.map((regional) => regional.id);
	const [responsaveisByRegional, citiesByRegional] = await Promise.all([
		loadResponsaveis(client, ids),
		loadCities(client, ids),
	]);

	const userIds = [
		...new Set(
			[...responsaveisByRegional.values()]
				.flat()
				.map((item) => item.userId)
				.filter(Boolean),
		),
	];
	const usersById = new Map();
	if (userIds.length) {
		const { rows: users } = await client.query(
			`select id, name, username, avatar_url from rot_users where id = any($1::text[])`,
			[userIds],
		);
		for (const user of users) {
			usersById.set(user.id, {
				id: user.id,
				name: user.name,
				username: user.username,
				avatarUrl: user.avatar_url || "",
			});
		}
	}

	return regionais.map((regional) => {
		const cities = citiesByRegional.get(regional.id) || [];
		const citiesById = new Map(cities.flatMap((city) => [[city.id, city], [city.canonicalId, city]]));
		const responsaveis = (responsaveisByRegional.get(regional.id) || []).map((item) => ({
			...item,
			user: item.userId ? usersById.get(item.userId) || null : null,
			city: item.cityId ? citiesById.get(item.cityId) || null : null,
		}));
		return {
			...publicRegional(regional, responsaveis),
			cities,
		};
	});
}

async function mirrorLegacyRegional(client, regionalId, name, responsaveis) {
	await client.query(
		`insert into rot_regionals (id, name, responsaveis)
		 values ($1, $2, $3::jsonb)
		 on conflict (id) do update set
			name = excluded.name,
			responsaveis = excluded.responsaveis,
			updated_at = now()`,
		[regionalId, name, JSON.stringify(responsaveis)],
	);
	await client.query(
		`insert into rot_regional_operation_scopes (regional_id, operation_type)
		 values ($1, 'ROT')
		 on conflict do nothing`,
		[regionalId],
	);
}

async function mirrorLegacyCity(client, city) {
	await client.query(
		`insert into rot_cities (id, name, regional_id, lat, lng)
		 values ($1, $2, $3, $4, $5)
		 on conflict (id) do update set
			name = excluded.name,
			regional_id = excluded.regional_id,
			lat = excluded.lat,
			lng = excluded.lng,
			updated_at = now()`,
		[city.id, city.name, city.regionalId, city.lat, city.lng],
	);
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const { rows: regionais } = await db.query(
			`select id, nome, ativo, legacy_path, legacy_document_id, source_payload, created_at, updated_at
			   from regionais
			  where ativo = true
			  order by lower(nome), nome`,
		);
		const items = await hydrateRegionals(db, regionais);
		res.json({ ok: true, items });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const name = String(req.body?.name || "").trim();
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome da regional." });
			return;
		}
		const responsaveis = sanitizeResponsaveis(req.body?.responsaveis);
		const gruposOperacionais = normalizeOperationalGroups(
			req.body?.gruposOperacionais || req.body?.grupos_operacionais || {},
		);
		const id = `regional_${Date.now()}`;
		await client.query("begin");
		const { rows } = await client.query(
			`insert into regionais (id, nome, ativo, legacy_path, legacy_document_id, source_payload)
			 values ($1, $2, true, $3, $1, $4::jsonb)
			 returning id, nome, ativo, legacy_path, legacy_document_id, source_payload, created_at, updated_at`,
			[
				id,
				name,
				`rot_regionals/${id}`,
				JSON.stringify({
					legacyTable: "rot_regionals",
					responsaveis,
					gruposOperacionais,
				}),
			],
		);
		await client.query(
			`insert into regional_operation_scopes (regional_id, operation_type)
			 values ($1, 'ROT')
			 on conflict do nothing`,
			[id],
		);
		await insertRegionalResponsaveis(client, id, responsaveis);
		await mirrorLegacyRegional(client, id, name, responsaveis);
		await client.query("commit");
		res.json({ ok: true, regional: { ...publicRegional(rows[0], responsaveis), cities: [] } });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (duplicateRegionalName(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma regional com esse nome." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.put("/:id", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		await client.query("begin");
		const current = await findRegional(client, req.params.id);
		if (!current) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Regional nao encontrada." });
			return;
		}
		const currentResponsaveis = await loadResponsaveis(client, [current.id]);
		const name = req.body?.name !== undefined ? String(req.body.name).trim() : current.nome;
		if (!name) {
			await client.query("rollback");
			res.status(400).json({ ok: false, error: "Informe o nome da regional." });
			return;
		}
		const responsaveis =
			req.body?.responsaveis !== undefined
				? sanitizeResponsaveis(req.body.responsaveis)
				: currentResponsaveis.get(current.id) || [];
		const gruposOperacionais =
			req.body?.gruposOperacionais !== undefined || req.body?.grupos_operacionais !== undefined
				? normalizeOperationalGroups(req.body.gruposOperacionais || req.body.grupos_operacionais)
				: normalizeOperationalGroups(current.source_payload?.gruposOperacionais || current.source_payload?.grupos_operacionais || {});

		const { rows } = await client.query(
			`update regionais
			    set nome = $2,
			        source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('responsaveis', $3::jsonb, 'gruposOperacionais', $4::jsonb),
			        updated_at = now()
			  where id = $1
			  returning id, nome, ativo, legacy_path, legacy_document_id, source_payload, created_at, updated_at`,
			[current.id, name, JSON.stringify(responsaveis), JSON.stringify(gruposOperacionais)],
		);
		await client.query(`delete from regional_responsaveis where regional_id = $1`, [current.id]);
		await insertRegionalResponsaveis(client, current.id, responsaveis);
		await mirrorLegacyRegional(client, current.id, name, responsaveis);
		await client.query("commit");

		const [regional] = await hydrateRegionals(db, rows);
		res.json({ ok: true, regional });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (duplicateRegionalName(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma regional com esse nome." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.delete("/:id", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		await client.query("begin");
		const regional = await findRegional(client, req.params.id);
		if (!regional) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Regional nao encontrada." });
			return;
		}
		const { rows: usersUsing } = await client.query(
			`select count(*)::int as total from rot_users where regional_id = $1`,
			[regional.id],
		);
		if (usersUsing[0]?.total > 0) {
			await client.query("rollback");
			res.status(409).json({ ok: false, error: "Existem usuarios vinculados a essa regional." });
			return;
		}
		await client.query(`delete from regionais where id = $1`, [regional.id]);
		await client.query(`delete from rot_cities where regional_id = $1`, [regional.id]);
		await client.query(`delete from rot_regionals where id = $1`, [regional.id]);
		await client.query("commit");
		res.json({ ok: true });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client.release();
	}
});

router.post("/:id/cities", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const name = String(req.body?.name || "").trim();
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome da cidade." });
			return;
		}
		const lat = req.body?.lat !== undefined && req.body?.lat !== "" ? Number(req.body.lat) : null;
		const lng = req.body?.lng !== undefined && req.body?.lng !== "" ? Number(req.body.lng) : null;
		const code = nullableCityCode(req.body?.code);
		const tipo = String(req.body?.tipo || req.body?.type || "Comum").trim() || "Comum";
		await client.query("begin");
		const regional = await findRegional(client, req.params.id);
		if (!regional) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Regional nao encontrada." });
			return;
		}
		const existing = await findCityByNormalizedName(client, regional.id, name);
		if (existing) {
			const { rows } = await client.query(
				`update regional_cidades
				    set nome = $2,
				        tipo = coalesce($3, tipo),
				        code = $5,
				        lat = $6,
				        lng = $7,
				        source_payload = coalesce(source_payload, '{}'::jsonb) || $4::jsonb,
				        updated_at = now()
				  where id = $1
				  returning id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at`,
				[
					existing.id,
					name,
					tipo,
					JSON.stringify({ legacyTable: "rot_cities", lat, lng, tipo }),
					code,
					lat,
					lng,
				],
			);
			const city = publicCity(rows[0]);
			await mirrorLegacyCity(client, city);
			await client.query("commit");
			res.json({ ok: true, city });
			return;
		}
		const { rows } = await client.query(
			`insert into regional_cidades (regional_id, nome, tipo, code, lat, lng, source_payload)
			 values ($1, $2, $3, $5, $6, $7, $4::jsonb)
			 returning id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at`,
			[
				regional.id,
				name,
				tipo,
				JSON.stringify({ legacyTable: "rot_cities", lat, lng, tipo }),
				code,
				lat,
				lng,
			],
		);
		let city = publicCity(rows[0]);
		await client.query(
			`update regional_cidades
			    set legacy_path = $2,
			        legacy_document_id = $3
			  where id = $1
			  returning id, regional_id, nome, tipo, legacy_document_id, source_payload, created_at, updated_at`,
			[rows[0].id, `rot_cities/${city.canonicalId}`, city.canonicalId],
		);
		city = { ...city, id: city.canonicalId };
		await mirrorLegacyCity(client, city);
		await client.query("commit");
		res.json({ ok: true, city });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (duplicateCityName(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma cidade com esse nome nessa regional." });
			return;
		}
		if (duplicateCityCode(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma cidade com esse codigo de base." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.put("/cities/:cityId", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		const name = String(req.body?.name || "").trim();
		if (!name) {
			res.status(400).json({ ok: false, error: "Informe o nome da cidade." });
			return;
		}
		const lat = req.body?.lat !== undefined && req.body?.lat !== "" ? Number(req.body.lat) : null;
		const lng = req.body?.lng !== undefined && req.body?.lng !== "" ? Number(req.body.lng) : null;
		const code = nullableCityCode(req.body?.code);
		const tipo = String(req.body?.tipo || req.body?.type || "Comum").trim() || "Comum";
		await client.query("begin");
		const current = await findCity(client, req.params.cityId);
		if (!current) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Cidade nao encontrada." });
			return;
		}
		const existing = await findCityByNormalizedName(client, current.regional_id, name, current.id);
		if (existing) {
			await client.query("rollback");
			res.status(409).json({ ok: false, error: "Ja existe uma cidade com esse nome nessa regional." });
			return;
		}
		const { rows } = await client.query(
			`update regional_cidades
			    set nome = $2,
			        tipo = $3,
			        code = $5,
			        lat = $6,
			        lng = $7,
			        source_payload = coalesce(source_payload, '{}'::jsonb) || $4::jsonb,
			        updated_at = now()
			  where id = $1
			  returning id, regional_id, nome, tipo, code, lat, lng, legacy_document_id, source_payload, created_at, updated_at`,
			[current.id, name, tipo, JSON.stringify({ lat, lng, tipo, legacyTable: "rot_cities" }), code, lat, lng],
		);
		const city = publicCity(rows[0]);
		await mirrorLegacyCity(client, city);
		await client.query("commit");
		res.json({ ok: true, city });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		if (duplicateCityName(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma cidade com esse nome nessa regional." });
			return;
		}
		if (duplicateCityCode(error)) {
			res.status(409).json({ ok: false, error: "Ja existe uma cidade com esse codigo de base." });
			return;
		}
		next(error);
	} finally {
		client.release();
	}
});

router.delete("/cities/:cityId", requireRotPermission("rot.regionals.manage"), async (req, res, next) => {
	const client = await db.connect();
	try {
		await client.query("begin");
		const city = await findCity(client, req.params.cityId);
		if (!city) {
			await client.query("rollback");
			res.status(404).json({ ok: false, error: "Cidade nao encontrada." });
			return;
		}
		const publicId = city.legacy_document_id || String(city.id);
		const { rows: usersUsing } = await client.query(
			`select count(*)::int as total from rot_users where city_id = $1 or city_id = $2`,
			[publicId, String(city.id)],
		);
		if (usersUsing[0]?.total > 0) {
			await client.query("rollback");
			res.status(409).json({ ok: false, error: "Existem usuarios vinculados a essa cidade." });
			return;
		}
		await client.query(`delete from regional_cidades where id = $1`, [city.id]);
		await client.query(`delete from rot_cities where id = $1 or id = $2`, [publicId, String(city.id)]);
		await client.query("commit");
		res.json({ ok: true });
	} catch (error) {
		await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client.release();
	}
});

module.exports = router;
