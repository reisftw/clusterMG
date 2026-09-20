const express = require("express");
const db = require("../db");
const { requireRotAuth, requireRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

function text(value) {
	return String(value ?? "").trim();
}

function jsonArray(value) {
	return Array.isArray(value) ? value : [];
}

function uniqueTexts(values) {
	return [...new Set(values.map(text).filter(Boolean))];
}

function normalizeAdjustmentLaunches(row) {
	const raw = jsonArray(row.itens);
	if (raw.some((entry) => Array.isArray(entry?.itens))) {
		return raw.map((entry) => ({
			tecnicoId: text(entry.tecnicoId || entry.technicianId),
			tecnicoNome: text(entry.tecnicoNome || entry.technicianName),
			tecnicoEmail: text(entry.tecnicoEmail || entry.technicianEmail),
			empresaId: text(entry.empresaId || entry.companyId),
			empresaNome: text(entry.empresaNome || entry.companyName),
			responsavel: text(entry.responsavel || entry.responsible),
			itens: jsonArray(entry.itens).map((item) => ({
				produtoId: text(item.produtoId || item.productId),
				codigo: text(item.codigo || item.code || item.produtoId || item.productId),
				nome: text(item.nome || item.descricao || item.description || item.name),
				descricao: text(item.descricao || item.description || item.nome || item.name),
				categoria: text(item.categoria || item.category),
				unidade: text(item.unidade || item.unit) || "un",
				quantidade: Number(item.quantidade ?? item.quantity ?? 1) || 1,
			})),
		}));
	}
	return [
		{
			tecnicoId: text(row.tecnico_id),
			tecnicoNome: text(row.tecnico_nome),
			empresaId: text(row.empresa_id),
			empresaNome: text(row.empresa_nome),
			itens: raw.map((item) => ({
				produtoId: text(item.produtoId || item.productId),
				codigo: text(item.codigo || item.code),
				nome: text(item.nome || item.descricao || item.description || item.name),
				descricao: text(item.descricao || item.description || item.nome || item.name),
				categoria: text(item.categoria || item.category),
				unidade: text(item.unidade || item.unit) || "un",
				quantidade: Number(item.quantidade ?? item.quantity ?? 1) || 1,
			})),
		},
	].filter((entry) => entry.itens.length || entry.tecnicoId || entry.tecnicoNome);
}

function publicAdjustment(row) {
	const source = row.source_payload || {};
	const launches = normalizeAdjustmentLaunches(row);
	const flatItems = launches.flatMap((launch) => launch.itens.map((item) => ({
		...item,
		tecnicoId: launch.tecnicoId,
		tecnicoNome: launch.tecnicoNome,
		empresaId: launch.empresaId,
		empresaNome: launch.empresaNome,
	})));
	const sourceCompanyNames = Array.isArray(source.empresaNomes) ? source.empresaNomes : [source.empresaNome];
	const sourceTechnicianNames = Array.isArray(source.tecnicoNomes) ? source.tecnicoNomes : [source.tecnicoNome];
	const companyNames = uniqueTexts([row.empresa_nome, ...launches.map((entry) => entry.empresaNome), ...sourceCompanyNames]);
	const technicianNames = uniqueTexts([row.tecnico_nome, ...launches.map((entry) => entry.tecnicoNome), ...sourceTechnicianNames]);
	return {
		id: String(row.id),
		companyId: row.empresa_id ? String(row.empresa_id) : "",
		companyName: companyNames[0] || "",
		companyNames,
		technicianId: row.tecnico_id ? String(row.tecnico_id) : "",
		technicianName: technicianNames[0] || "",
		technicianNames,
		regionalId: row.regional_id || "",
		regionalName: row.regional_nome || source.regional || "",
		code: row.codigo || "",
		date: row.data_acerto,
		status: row.status,
		items: flatItems,
		technicianAdjustments: launches,
		notes: row.observacoes || "",
		city: source.cidade || "",
		shift: source.turno || "",
		message: source.mensagem || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicDelivery(row) {
	return {
		id: String(row.id),
		companyId: row.empresa_id ? String(row.empresa_id) : "",
		companyName: row.empresa_nome || "",
		technicianId: row.tecnico_id ? String(row.tecnico_id) : "",
		technicianName: row.tecnico_nome || "",
		regionalId: row.regional_id || "",
		regionalName: row.regional_nome || "",
		date: row.data_entrega,
		type: row.tipo,
		status: row.status,
		items: row.itens || [],
		signature: row.assinatura || "",
		notes: row.observacoes || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicAudit(row) {
	return {
		id: String(row.id),
		technicianId: row.tecnico_id ? String(row.tecnico_id) : "",
		technicianName: row.tecnico_nome || "",
		regionalId: row.regional_id || "",
		regionalName: row.regional_nome || "",
		date: row.data_auditoria,
		status: row.status,
		score: Number(row.score || 0),
		responses: row.respostas || {},
		notes: row.observacoes || "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function listAdjustments() {
	const { rows } = await db.query(
		`select a.*, e.nome as empresa_nome, t.nome as tecnico_nome, r.nome as regional_nome
		   from operacao_acertos_estoque a
		   left join operacao_empresas e on e.id = a.empresa_id
		   left join operacao_tecnicos t on t.id = a.tecnico_id
		   left join regionais r on r.id = a.regional_id
		  order by a.data_acerto desc, a.created_at desc`,
	);
	return rows.map(publicAdjustment);
}

async function listDeliveries() {
	const { rows } = await db.query(
		`select d.*, e.nome as empresa_nome, t.nome as tecnico_nome, r.nome as regional_nome
		   from operacao_entregas_tecnicos d
		   left join operacao_empresas e on e.id = d.empresa_id
		   left join operacao_tecnicos t on t.id = d.tecnico_id
		   left join regionais r on r.id = d.regional_id
		  order by d.data_entrega desc, d.created_at desc`,
	);
	return rows.map(publicDelivery);
}

async function listAudits() {
	const { rows } = await db.query(
		`select a.*, t.nome as tecnico_nome, r.nome as regional_nome
		   from operacao_auditoria_bolsa a
		   left join operacao_tecnicos t on t.id = a.tecnico_id
		   left join regionais r on r.id = a.regional_id
		  order by a.data_auditoria desc, a.created_at desc`,
	);
	return rows.map(publicAudit);
}

router.get("/stock-adjustments", requireRotPermission(["rot.stock_adjustments.view", "rot.stock_adjustments.manage"]), noStore, async (req, res, next) => {
	try {
		res.json({ ok: true, items: await listAdjustments() });
	} catch (error) {
		next(error);
	}
});

router.post("/stock-adjustments", requireRotPermission("rot.stock_adjustments.manage"), async (req, res, next) => {
	try {
		const adjustmentItems = jsonArray(req.body?.technicianAdjustments).length
			? jsonArray(req.body?.technicianAdjustments)
			: jsonArray(req.body?.items);
		const { rows } = await db.query(
			`insert into operacao_acertos_estoque (empresa_id, tecnico_id, regional_id, codigo, data_acerto, status, itens, observacoes, source_payload, created_by, updated_by)
			 values ($1::uuid, $2::uuid, $3, $4, coalesce($5::date, current_date), $6, $7::jsonb, $8, $9::jsonb, $10, $10)
			 returning *`,
			[
				text(req.body?.companyId) || null,
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.code) || null,
				text(req.body?.date) || null,
				text(req.body?.status) || "Registrado",
				JSON.stringify(adjustmentItems),
				text(req.body?.notes) || null,
				JSON.stringify({
					cidade: text(req.body?.city),
					turno: text(req.body?.shift),
					empresaNomes: uniqueTexts(adjustmentItems.map((entry) => entry.empresaNome || entry.companyName)),
					tecnicoNomes: uniqueTexts(adjustmentItems.map((entry) => entry.tecnicoNome || entry.technicianName)),
				}),
				req.user?.id || null,
			],
		);
		const [item] = (await listAdjustments()).filter((entry) => entry.id === String(rows[0].id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.put("/stock-adjustments/:id", requireRotPermission("rot.stock_adjustments.manage"), async (req, res, next) => {
	try {
		const adjustmentItems = jsonArray(req.body?.technicianAdjustments).length
			? jsonArray(req.body?.technicianAdjustments)
			: jsonArray(req.body?.items);
		await db.query(
			`update operacao_acertos_estoque
			    set empresa_id=$2::uuid, tecnico_id=$3::uuid, regional_id=$4, codigo=$5, data_acerto=coalesce($6::date, data_acerto),
			        status=$7, itens=$8::jsonb, observacoes=$9,
			        source_payload = coalesce(source_payload, '{}'::jsonb) || $10::jsonb,
			        updated_by=$11, updated_at=now()
			  where id=$1`,
			[
				text(req.params.id),
				text(req.body?.companyId) || null,
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.code) || null,
				text(req.body?.date) || null,
				text(req.body?.status) || "Registrado",
				JSON.stringify(adjustmentItems),
				text(req.body?.notes) || null,
				JSON.stringify({
					cidade: text(req.body?.city),
					turno: text(req.body?.shift),
					empresaNomes: uniqueTexts(adjustmentItems.map((entry) => entry.empresaNome || entry.companyName)),
					tecnicoNomes: uniqueTexts(adjustmentItems.map((entry) => entry.tecnicoNome || entry.technicianName)),
				}),
				req.user?.id || null,
			],
		);
		const [item] = (await listAdjustments()).filter((entry) => entry.id === text(req.params.id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.delete("/stock-adjustments/:id", requireRotPermission("rot.stock_adjustments.manage"), async (req, res, next) => {
	try {
		await db.query(`delete from operacao_acertos_estoque where id = $1`, [text(req.params.id)]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/tech-deliveries", requireRotPermission(["rot.tech_deliveries.view", "rot.tech_deliveries.manage"]), noStore, async (req, res, next) => {
	try {
		res.json({ ok: true, items: await listDeliveries() });
	} catch (error) {
		next(error);
	}
});

router.post("/tech-deliveries", requireRotPermission("rot.tech_deliveries.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`insert into operacao_entregas_tecnicos (empresa_id, tecnico_id, regional_id, data_entrega, tipo, status, itens, assinatura, observacoes, created_by, updated_by)
			 values ($1::uuid, $2::uuid, $3, coalesce($4::date, current_date), $5, $6, $7::jsonb, $8, $9, $10, $10)
			 returning *`,
			[
				text(req.body?.companyId) || null,
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.date) || null,
				text(req.body?.type) || "Entrega",
				text(req.body?.status) || "Pendente",
				JSON.stringify(jsonArray(req.body?.items)),
				text(req.body?.signature) || null,
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		const [item] = (await listDeliveries()).filter((entry) => entry.id === String(rows[0].id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.put("/tech-deliveries/:id", requireRotPermission("rot.tech_deliveries.manage"), async (req, res, next) => {
	try {
		await db.query(
			`update operacao_entregas_tecnicos
			    set empresa_id=$2::uuid, tecnico_id=$3::uuid, regional_id=$4, data_entrega=coalesce($5::date, data_entrega),
			        tipo=$6, status=$7, itens=$8::jsonb, assinatura=$9, observacoes=$10, updated_by=$11, updated_at=now()
			  where id=$1`,
			[
				text(req.params.id),
				text(req.body?.companyId) || null,
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.date) || null,
				text(req.body?.type) || "Entrega",
				text(req.body?.status) || "Pendente",
				JSON.stringify(jsonArray(req.body?.items)),
				text(req.body?.signature) || null,
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		const [item] = (await listDeliveries()).filter((entry) => entry.id === text(req.params.id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.delete("/tech-deliveries/:id", requireRotPermission("rot.tech_deliveries.manage"), async (req, res, next) => {
	try {
		await db.query(`delete from operacao_entregas_tecnicos where id = $1`, [text(req.params.id)]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/bag-audit", requireRotPermission(["rot.bag_audit.view", "rot.bag_audit.manage"]), noStore, async (req, res, next) => {
	try {
		res.json({ ok: true, items: await listAudits() });
	} catch (error) {
		next(error);
	}
});

router.post("/bag-audit", requireRotPermission("rot.bag_audit.manage"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`insert into operacao_auditoria_bolsa (tecnico_id, regional_id, data_auditoria, status, score, respostas, observacoes, created_by, updated_by)
			 values ($1::uuid, $2, coalesce($3::date, current_date), $4, $5, $6::jsonb, $7, $8, $8)
			 returning *`,
			[
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.date) || null,
				text(req.body?.status) || "Pendente",
				Number(req.body?.score || 0),
				JSON.stringify(req.body?.responses || {}),
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		const [item] = (await listAudits()).filter((entry) => entry.id === String(rows[0].id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.put("/bag-audit/:id", requireRotPermission("rot.bag_audit.manage"), async (req, res, next) => {
	try {
		await db.query(
			`update operacao_auditoria_bolsa
			    set tecnico_id=$2::uuid, regional_id=$3, data_auditoria=coalesce($4::date, data_auditoria),
			        status=$5, score=$6, respostas=$7::jsonb, observacoes=$8, updated_by=$9, updated_at=now()
			  where id=$1`,
			[
				text(req.params.id),
				text(req.body?.technicianId) || null,
				text(req.body?.regionalId) || null,
				text(req.body?.date) || null,
				text(req.body?.status) || "Pendente",
				Number(req.body?.score || 0),
				JSON.stringify(req.body?.responses || {}),
				text(req.body?.notes) || null,
				req.user?.id || null,
			],
		);
		const [item] = (await listAudits()).filter((entry) => entry.id === text(req.params.id));
		res.json({ ok: true, item });
	} catch (error) {
		next(error);
	}
});

router.delete("/bag-audit/:id", requireRotPermission("rot.bag_audit.manage"), async (req, res, next) => {
	try {
		await db.query(`delete from operacao_auditoria_bolsa where id = $1`, [text(req.params.id)]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.get("/audit-reports", requireRotPermission("rot.audit_reports.view"), noStore, async (req, res, next) => {
	try {
		const [adjustments, deliveries, audits] = await Promise.all([listAdjustments(), listDeliveries(), listAudits()]);
		res.json({
			ok: true,
			summary: {
				stockAdjustments: adjustments.length,
				deliveries: deliveries.length,
				audits: audits.length,
				approvedAudits: audits.filter((item) => item.status === "Aprovada").length,
				failedAudits: audits.filter((item) => item.status === "Reprovada").length,
			},
			stockAdjustments: adjustments,
			deliveries,
			audits,
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
