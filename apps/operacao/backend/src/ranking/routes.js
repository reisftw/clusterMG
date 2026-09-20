const express = require("express");
const { READ_PERMISSIONS } = require("../auth/readPermissions");
const readGuard = require("../auth/middleware").requireRotPermission;
const db = require("../db");
const { requireRotAuth, scopeRegionalFilter } = require("../auth/middleware");
const { noStore } = require("../security/noStore");

// Ranking de Performance — fiel a rot/src/pages/RankingPage.tsx, mas sem
// tabela propria: calculado em cima do que ja existe (rot_tickets +
// rot_service_types), somando pontos/contando chamados por tecnico no
// periodo escolhido. Cada tecnico da equipe do chamado leva credito
// pelo chamado inteiro (nao dividido), mesma logica implicita do legado.
const router = express.Router();
router.use(requireRotAuth);

router.get("/", readGuard(READ_PERMISSIONS.ranking), noStore, async (req, res, next) => {
	try {
		const regionalScope = scopeRegionalFilter(req);
		const { dataInicio, dataFim, regionalId } = req.query;

		const conditions = [];
		const params = [];
		if (regionalScope) {
			params.push(regionalScope);
			conditions.push(`t.regional_id = $${params.length}`);
		} else if (regionalId && regionalId !== "all") {
			params.push(regionalId);
			conditions.push(`t.regional_id = $${params.length}`);
		}
		if (dataInicio) {
			params.push(dataInicio);
			conditions.push(`t.date >= $${params.length}`);
		}
		if (dataFim) {
			params.push(dataFim);
			conditions.push(`t.date <= $${params.length}`);
		}
		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

		const { rows } = await db.query(
			`select
				u.id, u.name, u.avatar_url, u.role_id, r.name as role_name,
				count(distinct t.id) as tickets_count,
				coalesce(sum(st.points), 0) as points
			 from rot_tickets t
			 cross join lateral unnest(t.team_ids) as member(user_id)
			 join rot_users u on u.id = member.user_id
			 left join rot_roles r on r.id = u.role_id
			 left join rot_service_types st on st.id = t.service_type_id
			 ${where}
			 group by u.id, u.name, u.avatar_url, u.role_id, r.name
			 order by points desc, tickets_count desc`,
			params,
		);

		res.json({
			ok: true,
			items: rows.map((row) => ({
				id: row.id,
				name: row.name,
				avatarUrl: row.avatar_url || "",
				role: row.role_id,
				roleName: row.role_name,
				ticketsCount: Number(row.tickets_count),
				points: Number(row.points),
			})),
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
