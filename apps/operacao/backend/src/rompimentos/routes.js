const express = require("express");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, requireRotPermission, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { auditLog } = require("../audit/auditLog");

// Rompimentos — fiel a rot/src/pages/RompimentosPage.tsx: pontos A/B,
// distancia ate a base, fibra lancada e materiais gastos por quantidade.
// Mantem compatibilidade com registros antigos que tinham materiais como
// texto livre.
const router = express.Router();
router.use(requireRotAuth);

const EARTH_RADIUS_KM = 6371;

function validPoint(point) {
	return point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}
function checkRegional(req, regionalId) {
	const scope = scopeRegionalFilter(req);
	if (scope && scope !== regionalId) { const e = new Error("Regional não autorizada."); e.status = 403; throw e; }
}

function normalizeCidadeKey(value) {
	return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

// Base pra calcular distancia: prioriza a coordenada da cidade
// (regional_cidades.lat/lng, cadastrada em Regionais > Cidades — mesma
// base usada no codigo do ativo) e cai pro ponto unico da regional
// (rot_rompimento_bases, modelo antigo) quando a cidade nao tem
// coordenada cadastrada ainda.
async function resolveBase(regionalId, cidade) {
	if (cidade) {
		const { rows } = await db.query(
			`select nome, lat, lng from regional_cidades where regional_id = $1 and lat is not null and lng is not null`,
			[regionalId],
		);
		const target = normalizeCidadeKey(cidade);
		const match = rows.find((row) => normalizeCidadeKey(row.nome) === target);
		if (match) return match;
	}
	const { rows: baseRows } = await db.query(`select lat, lng from rot_rompimento_bases where regional_id = $1`, [regionalId]);
	return baseRows[0] || null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
	if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
	const toRad = (deg) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return Number((EARTH_RADIUS_KM * c).toFixed(2));
}

function normalizeMateriais(value) {
	if (!value) return {};
	let source = value;
	if (typeof value === "string") {
		try {
			source = JSON.parse(value);
		} catch (_) {
			return {};
		}
	}
	if (!source || typeof source !== "object" || Array.isArray(source)) return {};
	const normalized = {};
	for (const [name, qty] of Object.entries(source)) {
		const label = String(name || "").trim().toUpperCase();
		const quantity = Number(qty);
		if (!label || !Number.isFinite(quantity) || quantity <= 0) continue;
		normalized[label] = quantity;
	}
	return normalized;
}

function plainTextMateriais(value) {
	if (!value || typeof value !== "string") return "";
	try {
		JSON.parse(value);
		return "";
	} catch (_) {
		return value;
	}
}

function serializeMateriais(value) {
	return JSON.stringify(normalizeMateriais(value));
}

function hasMateriais(value) {
	return Object.keys(normalizeMateriais(value)).length > 0;
}

const MAX_ROMPIMENTO_IMAGES = 10;

async function countConfirmedImages(client, rompimentoId) {
	const { rows } = await client.query(
		`select count(*)::int as total from rot_image_attachments
		 where entidade_tipo='ROMPIMENTO' and entidade_id=$1 and status='CONFIRMED' and removido_em is null`,
		[rompimentoId],
	);
	return rows[0]?.total || 0;
}

function publicRompimento(row) {
	return {
		id: row.id,
		ticketNumber: row.ticket_number || "",
		status: row.status || "concluido",
		regionalId: row.regional_id,
		clienteNome: row.cliente_nome,
		cidade: row.cidade,
		pontoA: row.ponto_a_lat !== null ? { lat: row.ponto_a_lat, lng: row.ponto_a_lng } : null,
		pontoB: row.ponto_b_lat !== null ? { lat: row.ponto_b_lat, lng: row.ponto_b_lng } : null,
		distanciaBase: row.distancia_base !== null ? Number(row.distancia_base) : null,
		materiais: normalizeMateriais(row.materiais),
		outros: row.outros || plainTextMateriais(row.materiais),
		fibraGasta: { tipo: row.fibra_tipo, metros: row.fibra_metros !== null ? Number(row.fibra_metros) : null },
		createdBy: row.created_by,
		createdByName: row.created_by_name || null,
		imageCount: Number(row.image_count || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/", noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { rows } = await db.query(
			regionalScope
				? `select r.*, u.name as created_by_name,
					(select count(*)::int from rot_image_attachments i where i.entidade_tipo='ROMPIMENTO' and i.entidade_id=r.id and i.status='CONFIRMED' and i.removido_em is null) as image_count
				   from rot_rompimentos r left join rot_users u on u.id = r.created_by where r.regional_id = $1 order by r.created_at desc`
				: `select r.*, u.name as created_by_name,
					(select count(*)::int from rot_image_attachments i where i.entidade_tipo='ROMPIMENTO' and i.entidade_id=r.id and i.status='CONFIRMED' and i.removido_em is null) as image_count
				   from rot_rompimentos r left join rot_users u on u.id = r.created_by order by r.created_at desc`,
			regionalScope ? [regionalScope] : [],
		);
		res.json({ ok: true, items: rows.map(publicRompimento) });
	} catch (error) {
		next(error);
	}
});

router.get("/bases", noStore, async (req, res, next) => {
	try {
		const { rows } = await db.query(`select * from rot_rompimento_bases`);
		res.json({ ok: true, items: rows.map((row) => ({ regionalId: row.regional_id, lat: row.lat, lng: row.lng })) });
	} catch (error) {
		next(error);
	}
});

router.put("/bases/:regionalId", requireRotPermission("rot.rompimentos.manage"), async (req, res, next) => {
	try {
		const { lat, lng } = req.body || {};
		checkRegional(req, req.params.regionalId);
		if (lat === undefined || lng === undefined) {
			res.status(400).json({ ok: false, error: "Informe latitude e longitude da base." });
			return;
		}
		await db.query(
			`insert into rot_rompimento_bases (regional_id, lat, lng) values ($1, $2, $3)
			 on conflict (regional_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now()`,
			[req.params.regionalId, Number(lat), Number(lng)],
		);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/draft", requireRotPermission(["rot.rompimentos.view", "rot.rompimentos.manage"]), async (req, res, next) => {
	try {
		const { ticketNumber, regionalId } = req.body || {};
		const selectedRegional = regionalId || req.rotUser.regional_id;
		checkRegional(req, selectedRegional);
		if (!ticketNumber?.trim()) {
			res.status(400).json({ ok: false, error: "Informe o número do ticket." });
			return;
		}
		if (!selectedRegional) {
			res.status(400).json({ ok: false, error: "Usuário sem regional vinculada para abrir rompimento." });
			return;
		}
		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_rompimentos (id, ticket_number, status, regional_id, created_by)
			 values ($1, $2, 'em_tratativa', $3, $4)
			 returning *`,
			[id, ticketNumber.trim(), selectedRegional, req.rotUser.id],
		);
		const enriched = { ...rows[0], created_by_name: req.rotUser.name };
		await auditLog(req, { action: "create_draft", entity: "rot_rompimentos", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, rompimento: publicRompimento(enriched) });
	} catch (error) {
		next(error);
	}
});

// POST / cria a tratativa (rot_rompimentos.status='em_tratativa') com o
// conjunto completo de campos, quando o chamador ja sabe tudo de antemao
// (alternativa mais rica ao POST /draft, que so pede ticket+regional).
// Nao pode marcar 'concluido' aqui: rompimentos anexam imagens via
// /admin/attachments (presigned URL, rot_image_attachments), que exige um
// entidade_id existente — ou seja, a linha precisa existir ANTES de
// qualquer upload. A finalizacao (status='concluido', exigindo 1-10
// imagens confirmadas) so acontece em PUT /:id, depois do upload.
router.post("/", requireRotPermission(["rot.rompimentos.view", "rot.rompimentos.manage"]), async (req, res, next) => {
	try {
		const { regionalId, ticketNumber, cidade, pontoA, pontoB, materiais, outros, fibraTipo, fibraMetros } = req.body || {};
		checkRegional(req, regionalId);
		if (!validPoint(pontoA) || !validPoint(pontoB)) { res.status(400).json({ok:false,error:"Marque os pontos A e B com coordenadas válidas."}); return; }
		if (!regionalId || !ticketNumber?.trim() || !cidade?.trim() || !fibraTipo?.trim() || !(Number(fibraMetros) > 0) || !hasMateriais(materiais)) {
			res.status(400).json({ ok: false, error: "Preencha ticket, regional, cidade/local, ponto A, ponto B, fibra, metragem e materiais antes de abrir a tratativa." });
			return;
		}
		const base = await resolveBase(regionalId, cidade);
		const distancia = base && pontoA ? haversineKm(base.lat, base.lng, pontoA.lat, pontoA.lng) : null;

		const id = randomId();
		const { rows } = await db.query(
			`insert into rot_rompimentos (id, ticket_number, status, regional_id, cliente_nome, cidade, ponto_a_lat, ponto_a_lng, ponto_b_lat, ponto_b_lng, distancia_base, materiais, outros, fibra_tipo, fibra_metros, created_by)
			 values ($1,$2,'em_tratativa',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
			[
				id,
				String(ticketNumber || "").trim(),
				regionalId,
				"",
				String(cidade || ""),
				pontoA?.lat ?? null,
				pontoA?.lng ?? null,
				pontoB?.lat ?? null,
				pontoB?.lng ?? null,
				distancia,
				serializeMateriais(materiais),
				String(outros || "").trim(),
				String(fibraTipo || ""),
				fibraMetros === undefined || fibraMetros === "" ? null : Number(fibraMetros),
				req.rotUser.id,
			],
		);
		const enriched = { ...rows[0], created_by_name: req.rotUser.name };
		await auditLog(req, { action: "create_draft", entity: "rot_rompimentos", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, rompimento: publicRompimento(enriched) });
	} catch (error) {
		next(error);
	}
});

router.put("/:id", requireRotPermission(["rot.rompimentos.view", "rot.rompimentos.manage"]), async (req, res, next) => {
	try {
		const { regionalId, ticketNumber, status, cidade, pontoA, pontoB, materiais, outros, fibraTipo, fibraMetros } = req.body || {};
		const { rows: before } = await db.query(`select * from rot_rompimentos where id = $1`, [req.params.id]);
		if (!before[0]) {
			res.status(404).json({ ok: false, error: "Rompimento não encontrado." });
			return;
		}
		checkRegional(req, before[0].regional_id);
		const canManage = userHasRotPermission(req.rotUser, "rot.rompimentos.manage");
		if (!canManage && before[0].created_by !== req.rotUser.id) {
			res.status(403).json({ ok: false, error: "Você só pode alterar rompimentos abertos por você." });
			return;
		}
		const novoRegionalId = regionalId === undefined ? before[0].regional_id : regionalId;
		checkRegional(req, novoRegionalId);
		const finalCidade = cidade === undefined ? before[0].cidade : cidade;
		const base = await resolveBase(novoRegionalId, finalCidade);
		if ((pontoA !== undefined && pontoA !== null && !validPoint(pontoA)) || (pontoB !== undefined && pontoB !== null && !validPoint(pontoB))) { res.status(400).json({ok:false,error:"Coordenadas inválidas."}); return; }
		const novoPontoA = pontoA !== undefined ? pontoA : before[0].ponto_a_lat !== null ? { lat: before[0].ponto_a_lat, lng: before[0].ponto_a_lng } : null;
		const novoPontoB = pontoB !== undefined ? pontoB : before[0].ponto_b_lat !== null ? { lat: before[0].ponto_b_lat, lng: before[0].ponto_b_lng } : null;
		const novoStatus = status || before[0].status || "concluido";
		if (novoStatus === "concluido") {
			const finalTicket = ticketNumber === undefined ? before[0].ticket_number : ticketNumber;
			const finalFibraTipo = fibraTipo === undefined ? before[0].fibra_tipo : fibraTipo;
			const finalFibraMetros = fibraMetros === undefined ? before[0].fibra_metros : fibraMetros;
			const finalMateriais = materiais === undefined ? before[0].materiais : materiais;
			if (!finalTicket?.trim() || !novoRegionalId || !finalCidade?.trim() || !finalFibraTipo?.trim() || !(Number(finalFibraMetros) > 0) || !hasMateriais(finalMateriais)) {
				res.status(400).json({ ok: false, error: "Preencha ticket, regional, cidade/local, fibra, metragem e materiais antes de finalizar." });
				return;
			}
			if (!validPoint(novoPontoA) || !validPoint(novoPontoB)) {
				res.status(400).json({ ok: false, error: "Marque os pontos A e B antes de finalizar." });
				return;
			}
			const confirmedImages = await countConfirmedImages(db, req.params.id);
			if (confirmedImages < 1) {
				res.status(400).json({ ok: false, error: "Anexe pelo menos 1 imagem antes de finalizar o rompimento." });
				return;
			}
			if (confirmedImages > MAX_ROMPIMENTO_IMAGES) {
				res.status(400).json({ ok: false, error: `Máximo de ${MAX_ROMPIMENTO_IMAGES} imagens por rompimento.` });
				return;
			}
		}
		const distancia = base && novoPontoA?.lat != null ? haversineKm(base.lat, base.lng, novoPontoA.lat, novoPontoA.lng) : before[0].distancia_base;

		const { rows } = await db.query(
			`update rot_rompimentos set
				regional_id = $2, ticket_number = coalesce($3, ticket_number), status = $4,
				cliente_nome = coalesce($5, cliente_nome), cidade = coalesce($6, cidade),
				ponto_a_lat = $7, ponto_a_lng = $8, ponto_b_lat = $9, ponto_b_lng = $10,
				distancia_base = $11, materiais = coalesce($12, materiais), outros = coalesce($13, outros),
				fibra_tipo = coalesce($14, fibra_tipo), fibra_metros = $15
			 where id = $1 returning *`,
			[
				req.params.id,
				novoRegionalId,
				ticketNumber === undefined ? null : String(ticketNumber || "").trim(),
				novoStatus,
				"",
				cidade ?? null,
				novoPontoA?.lat ?? null,
				novoPontoA?.lng ?? null,
				novoPontoB?.lat ?? null,
				novoPontoB?.lng ?? null,
				distancia,
				materiais === undefined ? null : serializeMateriais(materiais),
				outros === undefined ? null : String(outros || "").trim(),
				fibraTipo ?? null,
				fibraMetros === undefined ? before[0].fibra_metros : fibraMetros === "" ? null : Number(fibraMetros),
			],
		);
		await auditLog(req, { action: "update", entity: "rot_rompimentos", entityId: req.params.id, before: before[0], after: rows[0] });
		const { rows: imageRows } = await db.query(
			`select count(*)::int as total from rot_image_attachments
			 where entidade_tipo='ROMPIMENTO' and entidade_id=$1 and status='CONFIRMED' and removido_em is null`,
			[req.params.id],
		);
		res.json({ ok: true, rompimento: publicRompimento({ ...rows[0], image_count: imageRows[0]?.total || 0 }) });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireRotPermission("rot.rompimentos.manage"), async (req, res, next) => {
	try {
		const scope = scopeRegionalFilter(req);
		const { rows } = await db.query(`delete from rot_rompimentos where id = $1 and ($2::text is null or regional_id=$2) returning *`, [req.params.id, scope]);
		if (rows[0]) await auditLog(req, { action: "delete", entity: "rot_rompimentos", entityId: req.params.id, before: rows[0] });
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
