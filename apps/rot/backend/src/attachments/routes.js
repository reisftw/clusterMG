const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { generateObjectKey, getDefaultStorageProvider, getStorageProvider } = require("../storage");

const router = express.Router();
const MAX_IMAGES = 10;
const MAX_BYTES = 1024 * 1024;
const PENDING_MINUTES = 15;
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
const uploadLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.use(requireRotAuth, noStore);

function fail(status, message) {
	const error = new Error(message);
	error.status = status;
	throw error;
}

function normalizeEntityType(value) {
	const type = String(value || "").trim().toUpperCase();
	if (!["APR", "ROMPIMENTO", "ASSET"].includes(type)) fail(400, "Tipo de entidade inválido.");
	return type;
}

function validateImageMeta(meta = {}) {
	const mimeType = String(meta.mimeType || "").toLowerCase();
	const sizeBytes = Number(meta.sizeBytes || 0);
	const width = meta.width === undefined || meta.width === null ? null : Number(meta.width);
	const height = meta.height === undefined || meta.height === null ? null : Number(meta.height);
	if (!allowedMime.has(mimeType)) fail(400, "Formato de imagem inválido. Use JPEG, PNG ou WebP.");
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) fail(400, "Imagem deve ter até 1 MB após otimização.");
	if (width !== null && (!Number.isFinite(width) || width <= 0 || width > 10000)) fail(400, "Largura inválida.");
	if (height !== null && (!Number.isFinite(height) || height <= 0 || height > 10000)) fail(400, "Altura inválida.");
	return {
		mimeType,
		sizeBytes: Math.round(sizeBytes),
		width: width === null ? null : Math.round(width),
		height: height === null ? null : Math.round(height),
		originalName: String(meta.originalName || "").slice(0, 180),
	};
}

async function assertEntityAccess(client, req, entityType, entityId, mode = "view") {
	const scope = scopeRegionalFilter(req);
	if (entityType === "ASSET") {
		const { rows } = await client.query("select * from rot_assets where id=$1 and deleted_at is null", [entityId]);
		const item = rows[0];
		if (!item) fail(404, "Ativo não encontrado.");
		if (scope && item.regional_id !== scope) fail(403, "Regional não autorizada.");
		if (mode === "view" && !userHasRotPermission(req.rotUser, "ativos.visualizar")) fail(403, "Sem permissão para ver imagens deste ativo.");
		if (mode !== "view" && !userHasRotPermission(req.rotUser, ["ativos.editar", "checklists.executar", "ativos.transferir", "ativos.devolver", "ativos.bloquear", "ativos.liberar", "ocorrencias.criar", "manutencoes.criar"])) {
			fail(403, "Sem permissão para anexar imagens neste ativo.");
		}
		return item;
	}
	if (entityType === "ROMPIMENTO") {
		const { rows } = await client.query("select * from rot_rompimentos where id=$1", [entityId]);
		const item = rows[0];
		if (!item) fail(404, "Rompimento não encontrado.");
		if (scope && item.regional_id !== scope) fail(403, "Regional não autorizada.");
		const canManage = userHasRotPermission(req.rotUser, "rot.rompimentos.manage");
		if (mode !== "view" && !canManage && item.created_by !== req.rotUser.id) fail(403, "Você só pode anexar imagens nos rompimentos abertos por você.");
		if (mode === "view" && !canManage && item.created_by !== req.rotUser.id && !userHasRotPermission(req.rotUser, "rot.rompimentos.view")) fail(403, "Sem permissão para ver imagens deste rompimento.");
		return item;
	}

	const broad = userHasRotPermission(req.rotUser, ["rot.apr.view", "rot.apr.manage"]);
	const { rows } = await client.query(
		`select a.* from rot_aprs a
		 where a.id=$1
		   and ($2::text is null or a.regional_id=$2)
		   and (a.author_id=$3 or $4::boolean or exists (
		     select 1 from rot_regionals r, jsonb_array_elements(r.responsaveis) p
		     where r.id=a.regional_id and p->>'userId'=$3
		     and p->>'type' in ('supervisor_field','supervisor_rot')
		   ))`,
		[entityId, scope, req.rotUser.id, broad],
	);
	if (!rows[0]) fail(404, "APR não encontrada.");
	if (mode !== "view" && rows[0].author_id !== req.rotUser.id && !userHasRotPermission(req.rotUser, "rot.apr.manage")) fail(403, "Sem permissão para anexar imagens nesta APR.");
	return rows[0];
}

async function reserveSlot(client, req, { entityType, entityId, meta }) {
	await assertEntityAccess(client, req, entityType, entityId, "write");
	const lockKey = `${entityType}:${entityId}`;
	await client.query("select pg_advisory_xact_lock(hashtext($1))", [lockKey]);
	await client.query(
		`update rot_image_attachments set status='EXPIRED'
		 where entidade_tipo=$1 and entidade_id=$2 and status='PENDING' and expires_at < now()`,
		[entityType, entityId],
	);
	const { rows: counts } = await client.query(
		`select count(*)::int as total from rot_image_attachments
		 where entidade_tipo=$1 and entidade_id=$2 and removido_em is null
		   and (status='CONFIRMED' or (status='PENDING' and expires_at >= now()))`,
		[entityType, entityId],
	);
	if (counts[0].total >= MAX_IMAGES) fail(409, "Limite máximo de 10 fotos atingido.");

	const provider = getDefaultStorageProvider();
	const id = randomId("img");
	const key = generateObjectKey({ entityType: entityType.toLowerCase(), entityId, mimeType: meta.mimeType });
	await client.query(
		`insert into rot_image_attachments
		 (id,entidade_tipo,entidade_id,storage_key,storage_provider,mime_type,tamanho_bytes,largura,altura,nome_original,status,enviado_por,expires_at)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11,now()+($12 || ' minutes')::interval)`,
		[id, entityType, entityId, key, provider.name, meta.mimeType, meta.sizeBytes, meta.width, meta.height, meta.originalName, req.rotUser.id, PENDING_MINUTES],
	);
	return { id, provider, key };
}

router.post("/upload-url", uploadLimit, async (req, res, next) => {
	let client;
	try {
		const entityType = normalizeEntityType(req.body?.entityType);
		const entityId = String(req.body?.entityId || "").trim();
		if (!entityId) fail(400, "Entidade não informada.");
		const meta = validateImageMeta(req.body?.file);
		client = await db.connect();
		await client.query("begin");
		const reservation = await reserveSlot(client, req, { entityType, entityId, meta });
		const uploadUrl = await reservation.provider.createUploadUrl({ key: reservation.key, mimeType: meta.mimeType, expiresIn: 300 });
		await client.query("commit");
		console.log("[rot-storage] storage_upload_authorized", { userId: req.rotUser.id, entityType, entityId, attachmentId: reservation.id, provider: reservation.provider.name });
		res.status(201).json({
			ok: true,
			attachmentId: reservation.id,
			uploadUrl,
			method: "PUT",
			headers: { "Content-Type": meta.mimeType },
			expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
			maxBytes: MAX_BYTES,
		});
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/:id/confirm", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query("select * from rot_image_attachments where id=$1 for update", [req.params.id]);
		const attachment = rows[0];
		if (!attachment || attachment.removido_em) fail(404, "Imagem não encontrada.");
		if (attachment.status !== "PENDING") fail(409, "Upload não está pendente.");
		if (new Date(attachment.expires_at).getTime() < Date.now()) fail(410, "Reserva de upload expirada.");
		await assertEntityAccess(client, req, attachment.entidade_tipo, attachment.entidade_id, "write");
		const provider = getStorageProvider(attachment.storage_provider);
		const head = await provider.headObject(attachment.storage_key);
		if (!allowedMime.has(head.contentType) || head.contentType !== attachment.mime_type || head.contentLength <= 0 || head.contentLength > MAX_BYTES) {
			await provider.deleteObject(attachment.storage_key).catch(() => {});
			await client.query("update rot_image_attachments set status='FAILED', removido_em=now() where id=$1", [attachment.id]);
			fail(400, "Imagem enviada não passou na validação.");
		}
		const { rows: updated } = await client.query(
			`update rot_image_attachments
			 set status='CONFIRMED', tamanho_bytes=$2, confirmed_at=now()
			 where id=$1 returning *`,
			[attachment.id, head.contentLength],
		);
		await client.query("commit");
		console.log("[rot-storage] storage_upload_confirmed", { userId: req.rotUser.id, entityType: attachment.entidade_tipo, entityId: attachment.entidade_id, attachmentId: attachment.id, provider: attachment.storage_provider, size: head.contentLength, mimeType: head.contentType });
		res.json({ ok: true, item: publicAttachment(updated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

function publicAttachment(row, url = null, expiresAt = null) {
	return {
		id: row.id,
		entityType: row.entidade_tipo,
		entityId: row.entidade_id,
		mimeType: row.mime_type,
		sizeBytes: row.tamanho_bytes,
		width: row.largura,
		height: row.altura,
		originalName: row.nome_original,
		status: row.status,
		url,
		expiresAt,
		createdAt: row.created_at,
		confirmedAt: row.confirmed_at,
	};
}

router.get("/", async (req, res, next) => {
	try {
		const entityType = normalizeEntityType(req.query.entityType);
		const entityId = String(req.query.entityId || "").trim();
		if (!entityId) fail(400, "Entidade não informada.");
		await assertEntityAccess(db, req, entityType, entityId, "view");
		const { rows } = await db.query(
			`select * from rot_image_attachments
			 where entidade_tipo=$1 and entidade_id=$2 and status='CONFIRMED' and removido_em is null
			 order by created_at,id`,
			[entityType, entityId],
		);
		const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
		const items = [];
		for (const row of rows) {
			const provider = getStorageProvider(row.storage_provider);
			const url = await provider.createReadUrl({ key: row.storage_key, expiresIn: 300 });
			items.push(publicAttachment(row, url, expiresAt));
		}
		console.log("[rot-storage] storage_read_url_created", { userId: req.rotUser.id, entityType, entityId, count: items.length });
		res.json({ ok: true, items, maxImages: MAX_IMAGES });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query("select * from rot_image_attachments where id=$1 for update", [req.params.id]);
		const attachment = rows[0];
		if (!attachment || attachment.removido_em) fail(404, "Imagem não encontrada.");
		await assertEntityAccess(client, req, attachment.entidade_tipo, attachment.entidade_id, "write");
		const provider = getStorageProvider(attachment.storage_provider);
		await provider.deleteObject(attachment.storage_key).catch(() => {});
		await client.query("update rot_image_attachments set status='REMOVED', removido_em=now() where id=$1", [attachment.id]);
		await client.query("commit");
		console.log("[rot-storage] storage_object_deleted", { userId: req.rotUser.id, entityType: attachment.entidade_tipo, entityId: attachment.entidade_id, attachmentId: attachment.id, provider: attachment.storage_provider });
		res.json({ ok: true });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

module.exports = router;
module.exports.MAX_IMAGES = MAX_IMAGES;
