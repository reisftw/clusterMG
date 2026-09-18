const express = require("express");
const db = require("../db");
const { requireRotAuth, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

const router = express.Router();
router.use(requireRotAuth);

function dateKey(date) {
	return date.toISOString().slice(0, 10);
}

function weekBounds() {
	const now = new Date();
	const start = new Date(now);
	start.setDate(now.getDate() - now.getDay());
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(start.getDate() + 6);
	end.setHours(23, 59, 59, 999);
	return { start: dateKey(start), end: dateKey(end) };
}

function text(value) {
	return String(value ?? "").trim();
}

function jsonArray(value) {
	return Array.isArray(value) ? value : [];
}

function parseQuantity(value) {
	const number = Number(String(value ?? 0).replace(",", "."));
	return Number.isFinite(number) ? number : 0;
}

function itemLabel(item) {
	return text(item.nome || item.descricao || item.description || item.name || item.produto || item.product || item.codigo || item.code);
}

function classifyItem(item) {
	const label = `${itemLabel(item)} ${text(item.categoria || item.category)}`.toLowerCase();
	if (/(fibra|drop|cabo optico|cabo óptico|fo\b|bobina)/i.test(label)) return "fiber";
	if (/(onu|ont|roteador|router|equip|switch|modem|camera|câmera|radio|rádio|fonte|conector|sfp)/i.test(label)) return "equipment";
	return "other";
}

function normalizeAdjustmentLaunches(row) {
	const raw = jsonArray(row.itens);
	if (raw.some((entry) => Array.isArray(entry?.itens))) {
		return raw.map((entry) => ({
			technicianId: text(entry.tecnicoId || entry.technicianId || row.tecnico_id),
			technicianName: text(entry.tecnicoNome || entry.technicianName || row.tecnico_nome),
			companyName: text(entry.empresaNome || entry.companyName || row.empresa_nome),
			items: jsonArray(entry.itens).map((item) => ({
				name: itemLabel(item),
				category: text(item.categoria || item.category),
				unit: text(item.unidade || item.unit) || "un",
				quantity: parseQuantity(item.quantidade ?? item.quantity ?? 1),
			})),
		}));
	}
	return [{
		technicianId: text(row.tecnico_id),
		technicianName: text(row.tecnico_nome),
		companyName: text(row.empresa_nome),
		items: raw.map((item) => ({
			name: itemLabel(item),
			category: text(item.categoria || item.category),
			unit: text(item.unidade || item.unit) || "un",
			quantity: parseQuantity(item.quantidade ?? item.quantity ?? 1),
		})),
	}].filter((entry) => entry.items.length || entry.technicianId || entry.technicianName);
}

function addRanking(map, key, name, item) {
	if (!key && !name) return;
	const id = key || name;
	const current = map.get(id) || { id, name: name || "Técnico não informado", quantity: 0, items: {} };
	current.quantity += item.quantity;
	if (item.name) current.items[item.name] = (current.items[item.name] || 0) + item.quantity;
	map.set(id, current);
}

function topFromMap(map) {
	return [...map.values()].sort((a, b) => b.quantity - a.quantity)[0] || null;
}

function publicAdjustment(row) {
	const launches = normalizeAdjustmentLaunches(row);
	return {
		id: String(row.id),
		code: row.codigo || "",
		date: row.data_acerto,
		status: row.status,
		technicianName: launches.map((entry) => entry.technicianName).filter(Boolean)[0] || row.tecnico_nome || "Técnico não informado",
		companyName: launches.map((entry) => entry.companyName).filter(Boolean)[0] || row.empresa_nome || "",
		regionalName: row.regional_nome || "",
		itemsCount: launches.reduce((sum, entry) => sum + entry.items.length, 0),
		updatedAt: row.updated_at,
	};
}

function ensureOperationAccess(req, operation) {
	if (req.rotUser.role_id === "site_admin") return true;
	const scopes = Array.isArray(req.rotUser.operation_scopes) ? req.rotUser.operation_scopes : ["ROT"];
	return scopes.map((item) => String(item).toUpperCase()).includes(operation);
}

router.get("/:operation", noStore, async (req, res, next) => {
	try {
		const operation = String(req.params.operation || "").toUpperCase();
		if (!["ROT", "FIELD", "DELIVERY"].includes(operation)) {
			res.status(404).json({ ok: false, error: "Dashboard de operação não encontrada." });
			return;
		}
		if (!ensureOperationAccess(req, operation)) {
			res.status(403).json({ ok: false, error: "Você não tem acesso a esta dashboard." });
			return;
		}

		const regionalScope = scopeRegionalFilter(req);
		const { start, end } = weekBounds();
		const params = [start, end, operation, regionalScope];

		const [adjustmentsResult, techniciansResult, aprResult, checklistAlertsResult, checklistDoneResult] = await Promise.all([
			db.query(
				`select a.*, e.nome as empresa_nome, t.nome as tecnico_nome, r.nome as regional_nome
				   from operacao_acertos_estoque a
				   left join operacao_empresas e on e.id = a.empresa_id
				   left join operacao_tecnicos t on t.id = a.tecnico_id
				   left join operacao_tecnico_operation_scopes tos on tos.tecnico_id = t.id and tos.operation_type = $3
				   left join regionais r on r.id = coalesce(a.regional_id, t.regional_id)
				  where a.data_acerto between $1::date and $2::date
				    and (
				    	tos.operation_type = $3
				    	or (
				    		tos.tecnico_id is null
				    		and (($3 = 'DELIVERY' and t.area_operacional = 'delivery') or ($3 = 'FIELD' and t.area_operacional = 'field_service') or ($3 = 'ROT' and coalesce(t.area_operacional, '') not in ('delivery', 'field_service')))
				    	)
				    )
				    and ($4::text is null or coalesce(a.regional_id, t.regional_id) = $4)
				  order by a.data_acerto desc, a.updated_at desc
				  limit 80`,
				params,
			),
			db.query(
				`select count(*)::int as active
				   from operacao_tecnicos t
				   left join operacao_tecnico_operation_scopes tos on tos.tecnico_id = t.id and tos.operation_type = $1
				  where t.status = 'Ativo'
				    and (
				    	tos.operation_type = $1
				    	or (
				    		tos.tecnico_id is null
				    		and (($1 = 'DELIVERY' and t.area_operacional = 'delivery') or ($1 = 'FIELD' and t.area_operacional = 'field_service') or ($1 = 'ROT' and coalesce(t.area_operacional, '') not in ('delivery', 'field_service')))
				    	)
				    )
				    and ($2::text is null or t.regional_id = $2)`,
				[operation, regionalScope],
			),
			db.query(
				`select count(*)::int as total
				   from rot_aprs a
				  where a.created_at::date between $1::date and $2::date
				    and ($3::text is null or a.regional_id = $3)`,
				[start, end, regionalScope],
			),
			db.query(
				`select a.id, a.name, a.code, a.next_inspection_at, a.operation_scope, s.name as status_name, r.nome as regional_nome
				   from rot_assets a
				   left join rot_asset_statuses s on s.id = a.status_id
				   left join regionais r on r.id = a.regional_id
				  where a.deleted_at is null
				    and a.active = true
				    and a.requires_checklist = true
				    and a.operation_scope = $1
				    and ($2::text is null or a.regional_id = $2)
				    and (a.next_inspection_at is null or a.next_inspection_at <= (now() + interval '7 days'))
				  order by a.next_inspection_at nulls first, a.updated_at desc
				  limit 12`,
				[operation, regionalScope],
			),
			db.query(
				`select u.id, coalesce(u.name, 'Responsável não informado') as name, count(*)::int as total
				   from rot_checklist_executions ce
				   left join rot_assets a on a.id = ce.asset_id
				   left join rot_users u on u.id = ce.executed_by
				  where ce.completed_at::date between $1::date and $2::date
				    and coalesce(a.operation_scope, $3) = $3
				    and ($4::text is null or a.regional_id = $4)
				  group by u.id, u.name
				  order by total desc, name
				  limit 8`,
				[start, end, operation, regionalScope],
			),
		]);

		const fiberByTech = new Map();
		const equipmentByTech = new Map();
		const events = [];
		for (const row of adjustmentsResult.rows) {
			const launches = normalizeAdjustmentLaunches(row);
			for (const launch of launches) {
				for (const item of launch.items) {
					const type = classifyItem(item);
					if (type === "fiber") addRanking(fiberByTech, launch.technicianId, launch.technicianName, item);
					if (type === "equipment") addRanking(equipmentByTech, launch.technicianId, launch.technicianName, item);
				}
			}
			events.push({
				id: `adjustment-${row.id}`,
				type: "adjustment",
				date: row.data_acerto,
				title: row.tecnico_nome || "Acerto de estoque",
				description: `${row.status || "Registrado"}${row.regional_nome ? ` · ${row.regional_nome}` : ""}`,
			});
		}
		for (const row of checklistDoneResult.rows) {
			events.push({
				id: `checklist-${row.id || row.name}`,
				type: "checklist",
				date: new Date().toISOString().slice(0, 10),
				title: `${row.total} checklist(s)`,
				description: row.name,
			});
		}

		const checklistAlerts = checklistAlertsResult.rows.map((row) => ({
			id: row.id,
			name: row.name,
			code: row.code,
			statusName: row.status_name,
			regionalName: row.regional_nome,
			nextInspectionAt: row.next_inspection_at,
			severity: row.next_inspection_at && new Date(row.next_inspection_at) < new Date() ? "overdue" : "due",
		}));

		res.json({
			ok: true,
			operation,
			week: { start, end },
			stats: {
				adjustmentsWeek: adjustmentsResult.rows.length,
				activeTechnicians: Number(techniciansResult.rows[0]?.active || 0),
				aprWeek: Number(aprResult.rows[0]?.total || 0),
				checklistAlerts: checklistAlerts.length,
				checklistsDone: checklistDoneResult.rows.reduce((sum, row) => sum + Number(row.total || 0), 0),
			},
			recentAdjustments: adjustmentsResult.rows.slice(0, 8).map(publicAdjustment),
			topFiber: topFromMap(fiberByTech),
			topEquipment: topFromMap(equipmentByTech),
			checklistAlerts,
			supervisorChecklists: checklistDoneResult.rows.map((row) => ({ id: row.id || row.name, name: row.name, total: Number(row.total || 0) })),
			weekEvents: events.slice(0, 80),
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
