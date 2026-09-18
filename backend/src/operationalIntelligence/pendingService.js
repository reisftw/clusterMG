const db = require("../db");
const { scopeRegionalFilter } = require("../auth/middleware");
const { canAccessDomain, normalizeDomain } = require("./OperationalMetricsService");

async function getRotPendingItems(req, { from, to }) {
	const regionalScope = scopeRegionalFilter(req);
	const { rows: rules } = await db.query(
		`select * from operational_pending_rules
		where active = true
			and domain = 'ROT'
			and rule_type = 'open_older_than_days'
		order by created_at`,
	);
	const rule = rules[0];
	const days = Math.max(Number(rule?.config?.days || 1), 1);
	const params = [from, to, days];
	const regionalClause = regionalScope ? "and t.regional_id = $4" : "";
	if (regionalScope) params.push(regionalScope);

	const { rows } = await db.query(
		`select
			t.id,
			t.ticket_number,
			t.date,
			t.updated_at,
			current_date - t.date as aging_days,
			coalesce(r.nome, 'Regional não informada') as regional_name,
			coalesce(st.name, 'Tipo não informado') as service_type_name
		from rot_tickets t
		left join regionais r on r.id = t.regional_id
		left join rot_service_types st on st.id = t.service_type_id
		where t.status = 'aberto'
			and t.date between $1::date and $2::date
			and current_date - t.date >= $3::int
			${regionalClause}
		order by t.date asc
		limit 200`,
		params,
	);

	return rows.map((row) => ({
		id: `pending:${row.id}`,
		title: `Ticket ${row.ticket_number} aberto há ${Number(row.aging_days || 0)} dia(s)`,
		description: `${row.service_type_name} · ${row.regional_name}`,
		origin: "ticket",
		module: "Tickets",
		domain: "ROT",
		entityType: "rot_tickets",
		entityId: row.id,
		severity: rule?.severity || "high",
		priority: rule?.priority || "alta",
		status: "aberta",
		createdAt: row.date,
		updatedAt: row.updated_at,
		recommendedAction: "Priorizar tratativa ou atualizar o status do ticket.",
		deepLink: `/chamados?ticket=${encodeURIComponent(row.ticket_number || row.id)}`,
		automatic: true,
		sourceRuleId: rule?.id || "rot.ticket.open_older_than_days",
	}));
}

async function getPendingItems(req, { domain, from, to }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	if (normalizedDomain !== "ROT") {
		return {
			domain: normalizedDomain,
			period: { from, to },
			availability: "WAITING_INTEGRATION",
			reason: "Pendências de O.S dependem da integração Hubsoft. Pendências internas compartilhadas serão incorporadas nas próximas fases.",
			items: [],
		};
	}
	const items = await getRotPendingItems(req, { from, to });
	return {
		domain: normalizedDomain,
		period: { from, to },
		availability: "AVAILABLE",
		items,
	};
}

module.exports = { getPendingItems };
