const express = require("express");
const db = require("../db");
const { auditLog } = require("../audit/auditLog");
const { requireRotAuth, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(noStore);

function publicAsset(row) {
	return {
		code: row.code,
		name: row.name,
		operationScope: row.operation_scope,
		categoryName: row.category_name,
		typeName: row.type_name,
		statusId: row.status_id,
		statusName: row.status_name,
		statusColor: row.status_color,
		hasCustody: Boolean(row.custody_user_id || row.custody_technician_id),
		blockedForUse: Boolean(row.blocks_use),
		condition: row.blocks_use ? "N-OK" : "OK",
	};
}

const PUBLIC_ASSET_SELECT = `
	select
		a.id,
		a.code,
		a.name,
		a.operation_scope,
		a.regional_id,
		a.status_id,
		a.custody_user_id,
		a.custody_technician_id,
		a.last_movement_at,
		a.last_inspection_at,
		a.next_inspection_at,
		c.name as category_name,
		t.name as type_name,
		r.nome as regional_name,
		s.name as status_name,
		s.color as status_color,
		coalesce(s.blocks_use,false) as blocks_use,
		cr.name as criticality_name,
		cr.color as criticality_color
	 from rot_assets a
	 left join rot_asset_categories c on c.id = a.category_id
	 left join rot_asset_types t on t.id = a.type_id
	 left join regionais r on r.id = a.regional_id
	 left join rot_asset_statuses s on s.id = a.status_id
	 left join rot_asset_criticalities cr on cr.id = a.criticality_id
`;

async function loadPublicAssetByToken(token) {
	const { rows } = await db.query(
		`${PUBLIC_ASSET_SELECT}
		 where a.public_token=$1 and a.deleted_at is null and a.active = true
		 limit 1`,
		[token],
	);
	return rows[0] || null;
}

router.get("/:token", async (req, res, next) => {
	try {
		const token = String(req.params.token || "").trim();
		const asset = await loadPublicAssetByToken(token);
		if (!asset) {
			res.status(404).json({ ok: false, error: "Ativo não encontrado." });
			return;
		}
		res.json({ ok: true, asset: publicAsset(asset) });
	} catch (error) {
		next(error);
	}
});

router.post("/:token/checkout", requireRotAuth, async (req, res, next) => {
	let client;
	try {
		const token = String(req.params.token || "").trim();
		client = await db.connect();
		await client.query("begin");

		const { rows } = await client.query(
			`${PUBLIC_ASSET_SELECT}
			 where a.public_token=$1 and a.deleted_at is null and a.active = true
			 limit 1
			 for update of a`,
			[token],
		);
		const asset = rows[0];
		if (!asset) {
			res.status(404).json({ ok: false, error: "Ativo não encontrado." });
			await client.query("rollback");
			return;
		}
		const scopedRegional = scopeRegionalFilter(req);
		if (scopedRegional && asset.regional_id !== scopedRegional) {
			res.status(403).json({ ok: false, error: "Você não tem permissão para retirar ativo de outra regional." });
			await client.query("rollback");
			return;
		}
		if (asset.blocks_use || asset.status_id !== "disponivel" || asset.custody_user_id || asset.custody_technician_id) {
			res.status(409).json({ ok: false, error: "Este equipamento não está disponível para retirada." });
			await client.query("rollback");
			return;
		}

		const { rows: updatedRows } = await client.query(
			`update rot_assets
			    set custody_user_id=$2,
			        custody_technician_id=null,
			        status_id='em_uso',
			        last_movement_at=now()
			  where id=$1
			  returning *`,
			[asset.id, req.rotUser.id],
		);
		const after = updatedRows[0];
		await client.query(
			`insert into rot_asset_timeline (asset_id, event_type, title, description, before_data, after_data, created_by)
			 values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
			[
				asset.id,
				"qr_checkout",
				"Ativo retirado via QR Code",
				`Retirado por ${req.rotUser.name || req.rotUser.username || "usuario"}.`,
				JSON.stringify(asset),
				JSON.stringify(after),
				req.rotUser.id,
			],
		);
		await client.query("commit");
		await auditLog(req, { action: "qr_checkout", entity: "rot_assets", entityId: asset.id, before: asset, after });

		const reloaded = await loadPublicAssetByToken(token);
		res.json({
			ok: true,
			asset: publicAsset(reloaded || after),
			message: "Equipamento retirado para sua utilização.",
		});
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

module.exports = router;
