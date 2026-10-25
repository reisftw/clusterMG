const crypto = require("node:crypto");
const db = require("../db");
const notifications = require("../notificationsService");

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "REFUSED", "INVALID_PHONE", "ALREADY_RETURNED", "EQUIPMENT_UNAVAILABLE"];
const DEFAULT_SETTINGS = {
	enabled: true,
	assignmentAlerts: true,
	newOpportunityAlerts: true,
	hourlyAlerts: true,
	pushEnabled: true,
	intervalMinutes: 60,
	weekdays: [1, 2, 3, 4, 5],
	startTime: "08:00",
	endTime: "17:00",
};
let workerTimer = null;

function text(value) { return String(value || "").trim(); }
function normalize(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function bounded(value, fallback, min, max) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.min(Math.max(Math.trunc(number), min), max) : fallback;
}

async function getAlertSettings() {
	const result = await db.query("select alert_settings from tentativas_settings where id='global'");
	return { ...DEFAULT_SETTINGS, ...(result.rows[0]?.alert_settings || {}) };
}

function saoPauloParts(date = new Date()) {
	const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
	}).formatToParts(date).map((part) => [part.type, part.value]));
	const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday];
	return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}`, minutes: Number(values.hour) * 60 + Number(values.minute), weekday };
}

function timeMinutes(value, fallback) {
	const match = text(value).match(/^(\d{1,2}):(\d{2})/);
	return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function scheduleBucket(settings, now = new Date()) {
	const parts = saoPauloParts(now);
	const weekdays = Array.isArray(settings.weekdays) ? settings.weekdays.map(Number) : DEFAULT_SETTINGS.weekdays;
	const start = timeMinutes(settings.startTime, 480);
	const end = timeMinutes(settings.endTime, 1020);
	const interval = bounded(settings.intervalMinutes, 60, 15, 480);
	if (!weekdays.includes(parts.weekday) || parts.minutes < start || parts.minutes > end) return null;
	return { ...parts, interval, bucket: Math.floor((parts.minutes - start) / interval) };
}

async function createNotificationOnce(payload = {}) {
	const notificationId = text(payload.dedupeKey).replace(/[^\w.-]/g, "_");
	if (notificationId && await notifications.notificationExists(notificationId)) {
		return { skipped: true, id: notificationId };
	}
	return notifications.createNotification(payload);
}

async function publishCityAssignmentAlert(association = {}, actor = {}) {
	const settings = await getAlertSettings();
	if (!settings.enabled || !settings.assignmentAlerts || !association.user_id) return { skipped: true };
	const count = await db.query(
		`select count(*)::int total from tentativas_opportunities
		  where active=true and cidade_normalizada=$1
		    and telefone_digits ~ '^55[0-9]{10,11}$'
		    and status <> all($2::text[])`,
		[association.cidade_normalizada, TERMINAL_STATUSES],
	);
	return createNotificationOnce({
		type: "geral",
		title: "Nova cidade sob sua responsabilidade",
		message: `${association.cidade}: ${Number(count.rows[0]?.total || 0).toLocaleString("pt-BR")} O.S abertas para tratativa.`,
		targetPath: `/tentativas?tab=route&cidade=${encodeURIComponent(association.cidade)}`,
		severity: "info",
		user: actor,
		targets: { users: [association.user_id] },
		meta: { module: "tentativas", alertType: "CITY_ASSIGNED", technicianId: association.user_id, technicianName: association.user_name, city: association.cidade, pushEnabled: settings.pushEnabled !== false },
		dedupeKey: `tentativas-city-assigned-${association.id}`,
	});
}

async function publishNewOpportunityAlerts(newOpportunities = []) {
	const settings = await getAlertSettings();
	if (!settings.enabled || !settings.newOpportunityAlerts || !newOpportunities.length) return { created: 0 };
	const grouped = new Map();
	for (const item of newOpportunities) {
		const key = normalize(item.cidade_normalizada || item.cidade);
		if (!key) continue;
		const current = grouped.get(key) || { cidade: item.cidade, ids: [] };
		current.ids.push(item.id || item.os);
		grouped.set(key, current);
	}
	let created = 0;
	for (const [cityKey, group] of grouped.entries()) {
		const technicians = await db.query(
			`select distinct user_id,user_name,cidade from tentativas_technician_cities
			  where active=true and cidade_normalizada=$1 and user_id is not null
			    and (permanent=true or current_date between coalesce(valid_from,current_date) and coalesce(valid_until,current_date))`,
			[cityKey],
		);
		const digest = crypto.createHash("sha1").update(group.ids.sort().join("|")).digest("hex").slice(0, 12);
		for (const technician of technicians.rows) {
			const notification = await createNotificationOnce({
				type: "geral",
				title: "Novas O.S em sua cidade",
				message: `${group.ids.length} nova(s) O.S de retirada em ${group.cidade || technician.cidade}.`,
				targetPath: `/tentativas?tab=route&cidade=${encodeURIComponent(group.cidade || technician.cidade)}`,
				severity: "info",
				user: { uid: "tentativas-worker", nome: "Central de Tentativas" },
				targets: { users: [technician.user_id] },
				meta: { module: "tentativas", alertType: "NEW_OPPORTUNITIES", technicianId: technician.user_id, technicianName: technician.user_name, city: group.cidade || technician.cidade, count: group.ids.length, pushEnabled: settings.pushEnabled !== false },
				dedupeKey: `tentativas-new-os-${technician.user_id}-${digest}`,
			});
			if (!notification.skipped) created += 1;
		}
	}
	return { created };
}

async function publishHourlyTechnicianAlerts(now = new Date()) {
	const settings = await getAlertSettings();
	const slot = settings.enabled && settings.hourlyAlerts ? scheduleBucket(settings, now) : null;
	if (!slot) return { skipped: true, reason: "outside_schedule" };
	const result = await db.query(
		`with scope as (
		  select distinct user_id,user_name,cidade,cidade_normalizada
		  from tentativas_technician_cities
		  where active=true and user_id is not null
		    and (permanent=true or current_date between coalesce(valid_from,current_date) and coalesce(valid_until,current_date))
		), city_counts as (
		  select cidade_normalizada,count(*)::int total
		  from tentativas_opportunities
		  where active=true and telefone_digits ~ '^55[0-9]{10,11}$' and status <> all($1::text[])
		  group by cidade_normalizada
		)
		select s.user_id,max(s.user_name) user_name,
		       coalesce(sum(c.total),0)::int total,
		       jsonb_agg(jsonb_build_object('cidade',s.cidade,'total',coalesce(c.total,0)) order by s.cidade) cities
		from scope s left join city_counts c using(cidade_normalizada)
		group by s.user_id`,
		[TERMINAL_STATUSES],
	);
	let created = 0;
	for (const technician of result.rows) {
		if (!Number(technician.total)) continue;
		const cityText = (technician.cities || []).map((item) => `${item.cidade}: ${item.total}`).join(" · ");
		const notification = await createNotificationOnce({
			type: "geral",
			title: "O.S abertas para tratativa",
			message: `${Number(technician.total).toLocaleString("pt-BR")} O.S sob sua responsabilidade. ${cityText}`,
			targetPath: "/tentativas?tab=route",
			severity: "info",
			user: { uid: "tentativas-worker", nome: "Central de Tentativas" },
			targets: { users: [technician.user_id] },
			meta: { module: "tentativas", alertType: "HOURLY_OPEN_ORDERS", technicianId: technician.user_id, technicianName: technician.user_name, total: technician.total, cities: technician.cities, schedule: slot, pushEnabled: settings.pushEnabled !== false },
			dedupeKey: `tentativas-hourly-${technician.user_id}-${slot.date}-${slot.bucket}`,
		});
		if (!notification.skipped) created += 1;
	}
	return { created, slot };
}

async function recordPageVisit(user = {}, context = {}) {
	const profile = user.profile || user;
	const result = await db.query(
		`insert into tentativas_page_visits (user_id,user_email,user_name,role,session_id,source,user_agent,metadata)
		 values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id,visited_at`,
		[text(profile.uid || profile.id) || null, text(profile.email).toLowerCase() || null, text(profile.nome || profile.displayName || profile.email) || null, text(profile.role).toLowerCase() || null, text(context.sessionId) || null, text(context.source || "PWA"), text(context.userAgent), JSON.stringify(context.metadata || {})],
	);
	return { ok: true, ...result.rows[0] };
}

function dateFilter(query = {}) {
	return { start: text(query.startDate) || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), end: text(query.endDate) || new Date().toISOString().slice(0, 10) };
}

async function listUsageMetrics(query = {}) {
	const { start, end } = dateFilter(query);
	const page = bounded(query.page, 1, 1, 100000);
	const limit = bounded(query.limit, 20, 1, 100);
	const offset = (page - 1) * limit;
	const search = `%${text(query.search)}%`;
	const result = await db.query(
		`with technicians as (
		 select u.uid user_id,lower(u.email) user_email,coalesce(nullif(u.display_name,''),u.email) user_name
		 from app_users u
		 where coalesce(u.disabled,false)=false and lower(coalesce(u.role,''))='tecnico'
		), visits as (
		 select user_id,count(*)::int visits,count(distinct visited_at::date)::int active_days,max(visited_at) last_visit_at
		 from tentativas_page_visits where visited_at >= $1::date and visited_at < ($2::date + interval '1 day') group by user_id
		), alerts as (
		 select user_id,
		 count(distinct notification_id) filter(where event_type='CREATED')::int alerts_sent,
		 count(distinct notification_id) filter(where event_type='OPENED')::int alerts_opened,
		 max(event_at) filter(where event_type='OPENED') last_alert_opened_at
		 from retiradas_notification_events where event_at >= $1::date and event_at < ($2::date + interval '1 day') group by user_id
		)
		select count(*) over() total_count,t.user_id,t.user_email,t.user_name,
		 coalesce(v.visits,0) visits,coalesce(v.active_days,0) active_days,v.last_visit_at,
		 coalesce(a.alerts_sent,0) alerts_sent,coalesce(a.alerts_opened,0) alerts_opened,a.last_alert_opened_at
		from technicians t left join visits v using(user_id) left join alerts a using(user_id)
		where ($3::text='%%' or t.user_name ilike $3 or t.user_email ilike $3)
		order by v.last_visit_at desc nulls last,t.user_name asc limit $4 offset $5`,
		[start, end, search, limit, offset],
	);
	const summary = await db.query(
		`select count(distinct v.user_id)::int users_accessed,count(*)::int visits,max(v.visited_at) last_visit_at,
		 (select count(distinct coalesce(s.user_id,s.user_email))::int from retiradas_push_subscriptions s where s.active=true) push_users
		 from tentativas_page_visits v where v.visited_at >= $1::date and v.visited_at < ($2::date + interval '1 day')`,
		[start, end],
	);
	return { items: result.rows, total: Number(result.rows[0]?.total_count || 0), page, limit, startDate: start, endDate: end, summary: summary.rows[0] || {} };
}

async function listAlertHistory(query = {}) {
	const { start, end } = dateFilter(query);
	const page = bounded(query.page, 1, 1, 100000);
	const limit = bounded(query.limit, 20, 1, 100);
	const offset = (page - 1) * limit;
	const result = await db.query(
		`with created as (
		 select notification_id,user_id,user_email,min(event_at) created_at
		 from retiradas_notification_events where event_type='CREATED' and event_at >= $1::date and event_at < ($2::date + interval '1 day')
		 group by notification_id,user_id,user_email
		), events as (
		 select notification_id,user_id,
		 max(event_at) filter(where event_type='DELIVERED') push_delivered_at,
		 max(event_at) filter(where event_type='OPENED') opened_at,
		 max(event_at) filter(where event_type='READ') read_at
		 from retiradas_notification_events group by notification_id,user_id
		)
		select count(*) over() total_count,c.*,e.push_delivered_at,e.opened_at,e.read_at,
		 d.data->>'title' title,d.data->>'message' message,d.data->'meta' meta
		from created c
		join app_documents d on d.path='system_notifications/'||c.notification_id
		left join events e on e.notification_id=c.notification_id and e.user_id=c.user_id
		where d.data->'meta'->>'module'='tentativas'
		order by c.created_at desc limit $3 offset $4`,
		[start, end, limit, offset],
	);
	return { items: result.rows, total: Number(result.rows[0]?.total_count || 0), page, limit, startDate: start, endDate: end };
}

function startWorker() {
	if (workerTimer) return;
	const run = () => publishHourlyTechnicianAlerts().catch((error) => console.error("[tentativas-alerts] Falha no alerta programado:", error?.message || error));
	setTimeout(run, 90_000).unref?.();
	workerTimer = setInterval(run, 5 * 60 * 1000);
	workerTimer.unref?.();
}

function stopWorker() {
	if (workerTimer) clearInterval(workerTimer);
	workerTimer = null;
}

module.exports = {
	DEFAULT_SETTINGS,
	getAlertSettings,
	listAlertHistory,
	listUsageMetrics,
	publishCityAssignmentAlert,
	publishHourlyTechnicianAlerts,
	publishNewOpportunityAlerts,
	recordPageVisit,
	startWorker,
	stopWorker,
	__testables: { scheduleBucket, saoPauloParts },
};
