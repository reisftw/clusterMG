const db = require("../db");
const { scopeRegionalFilter } = require("../auth/middleware");
const HubsoftOrderProvider = require("./providers/HubsoftOrderProvider");
const TicketProvider = require("./providers/TicketProvider");

const VALID_DOMAINS = new Set(["ROT", "FIELD", "DELIVERY"]);

function normalizeDomain(domain) {
	const normalized = String(domain || "ROT").trim().toUpperCase();
	return VALID_DOMAINS.has(normalized) ? normalized : "ROT";
}

function defaultPeriod() {
	const now = new Date();
	const from = new Date(now.getFullYear(), now.getMonth(), 1);
	const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		from: from.toISOString().slice(0, 10),
		to: to.toISOString().slice(0, 10),
	};
}

function normalizePeriod(query = {}) {
	const fallback = defaultPeriod();
	return {
		from: /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || "")) ? query.from : fallback.from,
		to: /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || "")) ? query.to : fallback.to,
	};
}

function canAccessDomain(user, domain) {
	if (!user) return false;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	if (user.role_id === "site_admin" || permissions.includes("*")) return true;
	const scopes = Array.isArray(user.operation_scopes) ? user.operation_scopes : ["ROT"];
	return scopes.map((scope) => String(scope).toUpperCase()).includes(domain);
}

function providerFor(domain) {
	if (domain === "ROT") return new TicketProvider();
	return new HubsoftOrderProvider(domain);
}

async function getCatalog() {
	const { rows } = await db.query(
		`select code, name, description, domain, unit, source, provider, formula, availability, desired_direction, periodicity
		from operational_indicator_definitions
		where active = true
		order by coalesce(domain, 'ZZZ'), code`,
	);
	return rows.map((row) => ({
		code: row.code,
		name: row.name,
		description: row.description,
		domain: row.domain,
		unit: row.unit,
		source: row.source,
		provider: row.provider,
		formula: row.formula,
		availability: row.availability,
		desiredDirection: row.desired_direction,
		periodicity: row.periodicity,
	}));
}

async function getSummary(req, { domain, from, to }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const provider = providerFor(normalizedDomain);
	const regionalScope = scopeRegionalFilter(req);
	const metrics = await provider.getSummary({ from, to, regionalScope });
	const breakdowns = provider.getBreakdowns ? await provider.getBreakdowns({ from, to, regionalScope }) : null;
	return { domain: normalizedDomain, period: { from, to }, metrics, breakdowns };
}

async function getEvents(req, { domain, from, to, limit }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const provider = providerFor(normalizedDomain);
	const regionalScope = scopeRegionalFilter(req);
	return provider.getEvents({ from, to, regionalScope, limit });
}

async function getDrilldown(req, { domain, code, from, to, limit }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const provider = providerFor(normalizedDomain);
	if (!provider.getDrilldown) {
		return {
			availability: "WAITING_INTEGRATION",
			items: [],
			reason: "Drill-down depende da integração da fonte deste domínio.",
		};
	}
	const regionalScope = scopeRegionalFilter(req);
	const items = await provider.getDrilldown({ code, from, to, regionalScope, limit });
	return { availability: "AVAILABLE", items };
}

async function getJourney(req, { domain, from, to, technicianId }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!canAccessDomain(req.rotUser, normalizedDomain)) {
		const error = new Error("Você não tem escopo para acessar esta operação.");
		error.status = 403;
		throw error;
	}
	const provider = providerFor(normalizedDomain);
	if (!provider.getJourney) {
		return {
			availability: "WAITING_INTEGRATION",
			items: [],
			reason: "Jornada por O.S depende da integração Hubsoft.",
		};
	}
	const regionalScope = scopeRegionalFilter(req);
	const items = await provider.getJourney({ from, to, regionalScope, technicianId });
	return { availability: "AVAILABLE", items };
}

module.exports = {
	canAccessDomain,
	getCatalog,
	getDrilldown,
	getEvents,
	getJourney,
	getSummary,
	normalizeDomain,
	normalizePeriod,
};
