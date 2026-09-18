const db = require("../../db");
const { AVAILABILITY } = require("../availability");

function scopeParams({ from, to, regionalScope }) {
	const params = [from, to];
	const regionalClause = regionalScope ? "and t.regional_id = $3" : "";
	if (regionalScope) params.push(regionalScope);
	return { params, regionalClause };
}

function numberMetric({ code, name, value, domain = "ROT", unit = "count", source = "rot_tickets" }) {
	return {
		code,
		name,
		domain,
		unit,
		source,
		provider: "TicketProvider",
		value: Number(value || 0),
		availability: AVAILABILITY.AVAILABLE,
	};
}

class TicketProvider {
	async getSummary({ from, to, regionalScope }) {
		const { params, regionalClause } = scopeParams({ from, to, regionalScope });
		const { rows } = await db.query(
			`select
				count(*)::int as total,
				count(*) filter (where status = 'aberto')::int as open,
				count(*) filter (where status = 'concluido')::int as completed,
				count(distinct regional_id)::int as regionals,
				coalesce(max(current_date - t.date) filter (where status = 'aberto'), 0)::int as oldest_open_days
			from rot_tickets t
			where t.date between $1::date and $2::date
			${regionalClause}`,
			params,
		);
		const row = rows[0] || {};
		return [
			numberMetric({ code: "rot.tickets.total", name: "Tickets ROT recebidos", value: row.total }),
			numberMetric({ code: "rot.tickets.open", name: "Tickets ROT abertos", value: row.open }),
			numberMetric({ code: "rot.tickets.completed", name: "Tickets ROT concluídos", value: row.completed }),
			numberMetric({ code: "rot.tickets.regionals", name: "Regionais com tickets", value: row.regionals }),
			{
				...numberMetric({ code: "rot.tickets.oldest_open_days", name: "Maior aging aberto", value: row.oldest_open_days, unit: "days" }),
				source: "rot_tickets.date",
			},
		];
	}

	async getBreakdowns({ from, to, regionalScope }) {
		const { params, regionalClause } = scopeParams({ from, to, regionalScope });
		const [byRegional, byTechnician] = await Promise.all([
			db.query(
				`select
					coalesce(r.name, 'Regional não informada') as label,
					count(*)::int as total,
					count(*) filter (where t.status = 'aberto')::int as open,
					count(*) filter (where t.status = 'concluido')::int as completed
				from rot_tickets t
				left join rot_regionals r on r.id = t.regional_id
				where t.date between $1::date and $2::date
				${regionalClause}
				group by r.name
				order by total desc, label
				limit 20`,
				params,
			),
			db.query(
				`select
					coalesce(u.name, tech.tech_id, 'Técnico não informado') as label,
					count(*)::int as total,
					count(*) filter (where t.status = 'aberto')::int as open,
					count(*) filter (where t.status = 'concluido')::int as completed
				from rot_tickets t
				left join lateral unnest(case when cardinality(t.team_ids) > 0 then t.team_ids else array[null]::text[] end) as tech(tech_id) on true
				left join rot_users u on u.id = tech.tech_id
				where t.date between $1::date and $2::date
				${regionalClause}
				group by coalesce(u.name, tech.tech_id, 'Técnico não informado')
				order by total desc, label
				limit 20`,
				params,
			),
		]);
		return {
			byRegional: byRegional.rows.map((row) => ({ label: row.label, total: Number(row.total || 0), open: Number(row.open || 0), completed: Number(row.completed || 0) })),
			byTechnician: byTechnician.rows.map((row) => ({ label: row.label, total: Number(row.total || 0), open: Number(row.open || 0), completed: Number(row.completed || 0) })),
		};
	}

	async getEvents({ from, to, regionalScope, limit = 30 }) {
		const { params, regionalClause } = scopeParams({ from, to, regionalScope });
		const { rows } = await db.query(
			`select
				t.id,
				t.ticket_number,
				t.status,
				t.date,
				t.updated_at,
				coalesce(r.name, 'Regional não informada') as regional_name,
				coalesce(st.name, 'Tipo não informado') as service_type_name
			from rot_tickets t
			left join rot_regionals r on r.id = t.regional_id
			left join rot_service_types st on st.id = t.service_type_id
			where t.date between $1::date and $2::date
			${regionalClause}
			order by t.updated_at desc, t.date desc
			limit $${params.length + 1}`,
			[...params, Number(limit) || 30],
		);
		return {
			availability: AVAILABILITY.AVAILABLE,
			items: rows.map((row) => ({
				id: row.id,
				type: "rot.ticket",
				title: `Ticket ${row.ticket_number}`,
				description: `${row.service_type_name} · ${row.regional_name}`,
				status: row.status,
				occurredAt: row.updated_at || row.date,
			})),
		};
	}

	async getDrilldown({ code, from, to, regionalScope, limit = 100 }) {
		const { params, regionalClause } = scopeParams({ from, to, regionalScope });
		const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
		let statusClause = "";
		if (code === "rot.tickets.open") statusClause = "and t.status = 'aberto'";
		if (code === "rot.tickets.completed") statusClause = "and t.status = 'concluido'";
		if (code === "rot.tickets.oldest_open_days") statusClause = "and t.status = 'aberto'";

		const { rows } = await db.query(
			`select
				t.id,
				t.ticket_number,
				t.status,
				t.date,
				t.updated_at,
				current_date - t.date as aging_days,
				coalesce(r.name, 'Regional não informada') as regional_name,
				coalesce(c.name, 'Cidade não informada') as city_name,
				coalesce(st.name, 'Tipo não informado') as service_type_name,
				coalesce(
					(select array_agg(coalesce(u.name, tech_id) order by coalesce(u.name, tech_id))
					 from unnest(t.team_ids) as tech_id
					 left join rot_users u on u.id = tech_id),
					array[]::text[]
				) as team_names
			from rot_tickets t
			left join rot_regionals r on r.id = t.regional_id
			left join rot_cities c on c.id = t.city_id
			left join rot_service_types st on st.id = t.service_type_id
			where t.date between $1::date and $2::date
			${regionalClause}
			${statusClause}
			order by ${code === "rot.tickets.oldest_open_days" ? "t.date asc" : "t.updated_at desc, t.date desc"}
			limit $${params.length + 1}`,
			[...params, normalizedLimit],
		);
		return rows.map((row) => ({
			id: row.id,
			ticketNumber: row.ticket_number,
			status: row.status,
			date: row.date,
			updatedAt: row.updated_at,
			agingDays: Number(row.aging_days || 0),
			regionalName: row.regional_name,
			cityName: row.city_name,
			serviceTypeName: row.service_type_name,
			teamNames: row.team_names || [],
			deepLink: `/chamados?ticket=${encodeURIComponent(row.ticket_number || row.id)}`,
		}));
	}

	async getJourney({ from, to, regionalScope, technicianId }) {
		const params = [from, to];
		const clauses = ["t.date between $1::date and $2::date"];
		if (regionalScope) {
			params.push(regionalScope);
			clauses.push(`t.regional_id = $${params.length}`);
		}
		if (technicianId) {
			params.push(technicianId);
			clauses.push(`$${params.length} = any(t.team_ids)`);
		}
		const { rows } = await db.query(
			`select
				t.id,
				t.ticket_number,
				t.status,
				t.date,
				t.updated_at,
				coalesce(r.name, 'Regional não informada') as regional_name,
				coalesce(st.name, 'Tipo não informado') as service_type_name,
				coalesce(
					(select array_agg(coalesce(u.name, tech_id) order by coalesce(u.name, tech_id))
					 from unnest(t.team_ids) as tech_id
					 left join rot_users u on u.id = tech_id),
					array[]::text[]
				) as team_names
			from rot_tickets t
			left join rot_regionals r on r.id = t.regional_id
			left join rot_service_types st on st.id = t.service_type_id
			where ${clauses.join(" and ")}
			order by t.date asc, t.updated_at asc
			limit 500`,
			params,
		);
		return rows.map((row) => ({
			id: row.id,
			type: "rot.ticket",
			domain: "ROT",
			title: `Ticket ${row.ticket_number}`,
			description: `${row.service_type_name} · ${row.regional_name}`,
			status: row.status,
			teamNames: row.team_names || [],
			occurredAt: row.updated_at || row.date,
			source: "rot_tickets",
			deepLink: `/chamados?ticket=${encodeURIComponent(row.ticket_number || row.id)}`,
		}));
	}
}

module.exports = TicketProvider;
