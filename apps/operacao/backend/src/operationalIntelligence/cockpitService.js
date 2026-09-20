const db = require("../db");
const { scopeRegionalFilter } = require("../auth/middleware");
const { canAccessDomain, normalizeDomain } = require("./OperationalMetricsService");
const { getPendingItems } = require("./pendingService");

function metric(code, label, value, source, unit = "count", availability = "AVAILABLE") {
	return { code, label, value, unit, source, availability };
}

function scoreFromPressure(value, limit) {
	const normalizedLimit = Math.max(Number(limit || 1), 1);
	const pressure = Math.min(Number(value || 0) / normalizedLimit, 1);
	return Math.round(100 - pressure * 100);
}

function weightedAverage(parts) {
	const available = parts.filter((part) => part.availability === "AVAILABLE" && Number(part.weight) > 0);
	const totalWeight = available.reduce((sum, part) => sum + Number(part.weight), 0);
	if (!totalWeight) return null;
	return Math.round(available.reduce((sum, part) => sum + Number(part.score) * Number(part.weight), 0) / totalWeight);
}

async function getTicketStats({ from, to, regionalScope }) {
	const params = [from, to];
	const regionalClause = regionalScope ? "and t.regional_id = $3" : "";
	if (regionalScope) params.push(regionalScope);
	const { rows } = await db.query(
		`select
			count(*)::int as total_period,
			count(*) filter (where status = 'aberto')::int as open_period,
			count(*) filter (where status = 'concluido')::int as completed_period,
			count(*) filter (where date = current_date)::int as today_total,
			count(*) filter (where date = current_date and status = 'concluido')::int as today_completed,
			count(*) filter (where status = 'aberto')::int as backlog,
			coalesce(max(current_date - date) filter (where status = 'aberto'), 0)::int as oldest_open_days
		from rot_tickets t
		where t.date between $1::date and $2::date
		${regionalClause}`,
		params,
	);
	return rows[0] || {};
}

async function getAssetStats({ regionalScope }) {
	const params = [regionalScope || null];
	const { rows } = await db.query(
		`select
			count(*)::int as total,
			count(*) filter (where coalesce(s.blocks_use,false) = true)::int as blocked,
			count(*) filter (where a.status_id = 'com_ocorrencia')::int as with_problem,
			count(*) filter (where a.status_id = 'manutencao')::int as in_maintenance,
			count(*) filter (where a.next_inspection_at is not null and a.next_inspection_at < now())::int as overdue_inspections
		from rot_assets a
		left join rot_asset_statuses s on s.id = a.status_id
		where a.deleted_at is null
			and ($1::text is null or a.regional_id = $1)`,
		params,
	);
	const [occurrences, maintenance] = await Promise.all([
		db.query(
			`select count(*)::int as open
			from rot_asset_occurrences o
			join rot_assets a on a.id = o.asset_id
			where o.status in ('ABERTA','EM_TRATATIVA')
				and ($1::text is null or a.regional_id = $1)`,
			params,
		),
		db.query(
			`select count(*)::int as open
			from rot_maintenance_orders m
			join rot_assets a on a.id = m.asset_id
			where m.status not in ('LIBERADO','CANCELADO')
				and ($1::text is null or a.regional_id = $1)`,
			params,
		),
	]);
	return {
		...(rows[0] || {}),
		open_occurrences: occurrences.rows[0]?.open || 0,
		open_maintenance: maintenance.rows[0]?.open || 0,
	};
}

async function getCockpit(req, { domain, from, to }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const regionalScope = scopeRegionalFilter(req);
	const assets = await getAssetStats({ regionalScope });
	if (normalizedDomain !== "ROT") {
		return {
			domain: normalizedDomain,
			period: { from, to },
			availability: "PARTIAL",
			metrics: [
				metric(`${normalizedDomain.toLowerCase()}.os.completed`, "O.S concluídas", null, "Hubsoft", "service_orders", "WAITING_INTEGRATION"),
				metric(`${normalizedDomain.toLowerCase()}.os.open`, "O.S abertas", null, "Hubsoft", "service_orders", "WAITING_INTEGRATION"),
				metric("assets.blocked", "Ativos bloqueados", Number(assets.blocked || 0), "rot_assets"),
				metric("assets.open_occurrences", "Ocorrências abertas", Number(assets.open_occurrences || 0), "rot_asset_occurrences"),
				metric("assets.open_maintenance", "Manutenções abertas", Number(assets.open_maintenance || 0), "rot_maintenance_orders"),
			],
			now: [],
			today: [],
			month: [],
		};
	}
	const tickets = await getTicketStats({ from, to, regionalScope });
	return {
		domain: normalizedDomain,
		period: { from, to },
		availability: "AVAILABLE",
		metrics: [
			metric("rot.today.received", "Tickets recebidos hoje", Number(tickets.today_total || 0), "rot_tickets"),
			metric("rot.today.completed", "Tickets concluídos hoje", Number(tickets.today_completed || 0), "rot_tickets"),
			metric("rot.backlog", "Backlog aberto", Number(tickets.backlog || 0), "rot_tickets"),
			metric("rot.oldest_open_days", "Maior aging aberto", Number(tickets.oldest_open_days || 0), "rot_tickets.date", "days"),
			metric("assets.blocked", "Ativos bloqueados", Number(assets.blocked || 0), "rot_assets"),
			metric("assets.open_occurrences", "Ocorrências abertas", Number(assets.open_occurrences || 0), "rot_asset_occurrences"),
		],
		now: [
			{ label: "Backlog ROT", value: Number(tickets.backlog || 0), source: "rot_tickets" },
			{ label: "Tickets antigos", value: Number(tickets.oldest_open_days || 0), source: "rot_tickets.date", unit: "days" },
			{ label: "Ativos bloqueados", value: Number(assets.blocked || 0), source: "rot_assets" },
		],
		today: [
			{ label: "Recebidos hoje", value: Number(tickets.today_total || 0), source: "rot_tickets" },
			{ label: "Concluídos hoje", value: Number(tickets.today_completed || 0), source: "rot_tickets" },
			{ label: "Manutenções abertas", value: Number(assets.open_maintenance || 0), source: "rot_maintenance_orders" },
		],
		month: [
			{ label: "Recebidos no período", value: Number(tickets.total_period || 0), source: "rot_tickets" },
			{ label: "Concluídos no período", value: Number(tickets.completed_period || 0), source: "rot_tickets" },
			{ label: "Abertos no período", value: Number(tickets.open_period || 0), source: "rot_tickets" },
		],
	};
}

async function getControlTower(req, { domain, from, to }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const regionalScope = scopeRegionalFilter(req);
	const [rules, assets] = await Promise.all([
		db.query(`select * from operational_alert_rules where active = true and (domain is null or domain = $1) order by severity, id`, [normalizedDomain]),
		getAssetStats({ regionalScope }),
	]);
	const alerts = [];
	if (normalizedDomain === "ROT") {
		const tickets = await getTicketStats({ from, to, regionalScope });
		const agingRule = rules.rows.find((rule) => rule.rule_type === "open_ticket_aging");
		const backlogRule = rules.rows.find((rule) => rule.rule_type === "backlog_volume");
		if (agingRule && Number(tickets.oldest_open_days || 0) >= Number(agingRule.config?.days || 1)) {
			alerts.push({
				id: agingRule.id,
				title: agingRule.title,
				severity: agingRule.severity,
				fact: `Existe ticket aberto há ${Number(tickets.oldest_open_days || 0)} dia(s).`,
				recommendation: "Abrir o detalhamento de tickets abertos e priorizar os mais antigos.",
				source: agingRule.source,
				domain: normalizedDomain,
				deepLink: "/comando-operacional",
			});
		}
		if (backlogRule && Number(tickets.backlog || 0) >= Number(backlogRule.config?.openTickets || 20)) {
			alerts.push({
				id: backlogRule.id,
				title: backlogRule.title,
				severity: backlogRule.severity,
				fact: `Backlog ROT atual: ${Number(tickets.backlog || 0)} ticket(s) aberto(s).`,
				recommendation: "Revisar distribuição por técnico/regional no cockpit.",
				source: backlogRule.source,
				domain: normalizedDomain,
				deepLink: "/comando-operacional",
			});
		}
	}
	for (const rule of rules.rows.filter((item) => item.domain === null)) {
		const minimum = Number(rule.config?.minimum || 1);
		const valueByType = {
			blocked_assets: Number(assets.blocked || 0),
			open_occurrences: Number(assets.open_occurrences || 0),
			open_maintenance: Number(assets.open_maintenance || 0),
		};
		const value = valueByType[rule.rule_type] || 0;
		if (value >= minimum) {
			alerts.push({
				id: rule.id,
				title: rule.title,
				severity: rule.severity,
				fact: `${value} registro(s) encontrados.`,
				recommendation: "Abrir Ativos & Segurança e tratar os itens pendentes.",
				source: rule.source,
				domain: normalizedDomain,
				deepLink: "/ativos-seguranca",
			});
		}
	}
	if (normalizedDomain !== "ROT") {
		alerts.push({
			id: `${normalizedDomain.toLowerCase()}.hubsoft.waiting`,
			title: "Hubsoft aguardando integração",
			severity: "medium",
			fact: "Métricas de O.S ainda não estão disponíveis para este domínio.",
			recommendation: "Usar os indicadores internos e conectar Hubsoft quando a API estiver liberada.",
			source: "Hubsoft",
			domain: normalizedDomain,
			availability: "WAITING_INTEGRATION",
		});
	}
	return { domain: normalizedDomain, period: { from, to }, alerts };
}

async function getHealthScore(req, { domain, from, to }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const regionalScope = scopeRegionalFilter(req);
	const [{ rows: weights }, pending, assets] = await Promise.all([
		db.query(`select * from operational_health_weights where active = true and domain = $1 order by component`, [normalizedDomain]),
		getPendingItems(req, { domain: normalizedDomain, from, to }),
		getAssetStats({ regionalScope }),
	]);
	let tickets = {};
	if (normalizedDomain === "ROT") tickets = await getTicketStats({ from, to, regionalScope });
	const components = weights.map((row) => {
		let score = null;
		let availability = "AVAILABLE";
		let fact = "";
		if (row.component === "tickets") {
			score = Math.round((scoreFromPressure(tickets.backlog, row.config?.openLimit || 20) + scoreFromPressure(tickets.oldest_open_days, row.config?.agingLimitDays || 1)) / 2);
			fact = `${Number(tickets.backlog || 0)} aberto(s), maior aging ${Number(tickets.oldest_open_days || 0)} dia(s).`;
		} else if (row.component === "pending") {
			score = scoreFromPressure((pending.items || []).length, row.config?.pendingLimit || 10);
			fact = `${(pending.items || []).length} pendência(s).`;
		} else if (row.component === "assets") {
			score = Math.round((scoreFromPressure(assets.blocked, row.config?.blockedLimit || 5) + scoreFromPressure(assets.open_occurrences, row.config?.occurrenceLimit || 10)) / 2);
			fact = `${Number(assets.blocked || 0)} bloqueado(s), ${Number(assets.open_occurrences || 0)} ocorrência(s).`;
		} else if (row.component === "maintenance") {
			score = scoreFromPressure(assets.open_maintenance, row.config?.maintenanceLimit || 10);
			fact = `${Number(assets.open_maintenance || 0)} manutenção(ões) aberta(s).`;
		} else {
			score = Math.round((scoreFromPressure(assets.blocked, 5) + scoreFromPressure(assets.open_occurrences, 10) + scoreFromPressure(assets.open_maintenance, 10)) / 3);
			availability = normalizedDomain === "ROT" ? "AVAILABLE" : "PARTIAL";
			fact = "Componentes internos disponíveis; O.S Hubsoft fora do cálculo até integração.";
		}
		return {
			component: row.component,
			label: row.label,
			weight: Number(row.weight || 0),
			score,
			availability,
			fact,
		};
	});
	return {
		domain: normalizedDomain,
		period: { from, to },
		score: weightedAverage(components),
		components,
		explanation: "Métricas indisponíveis não recebem zero; o cálculo usa somente componentes disponíveis.",
	};
}

module.exports = {
	getCockpit,
	getControlTower,
	getHealthScore,
};
