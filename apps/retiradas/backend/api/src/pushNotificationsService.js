const crypto = require("node:crypto");
const webpush = require("web-push");
const db = require("./db");

const CONFIG_PATH = "internal_config/web_push_vapid";
let cachedVapid = null;

function text(value) {
	return String(value || "").trim();
}

function userIdentity(user = {}) {
	const profile = user.profile || user;
	return {
		id: text(profile.uid || profile.id || user.uid || user.id),
		email: text(profile.email || user.email).toLowerCase(),
		name: text(profile.nome || profile.displayName || profile.display_name || profile.email),
		role: text(profile.role || user.role).toLowerCase(),
	};
}

async function getVapidKeys() {
	if (cachedVapid) return cachedVapid;
	const envPublic = text(process.env.WEB_PUSH_PUBLIC_KEY);
	const envPrivate = text(process.env.WEB_PUSH_PRIVATE_KEY);
	if (envPublic && envPrivate) {
		cachedVapid = { publicKey: envPublic, privateKey: envPrivate };
		return cachedVapid;
	}
	const stored = await db.query("select data from app_documents where path = $1", [CONFIG_PATH]);
	let keys = stored.rows[0]?.data || null;
	if (!keys?.publicKey || !keys?.privateKey) {
		const generated = webpush.generateVAPIDKeys();
		await db.query(
			`insert into app_documents (path, collection_path, document_id, parent_path, data)
			 values ($1, 'internal_config', 'web_push_vapid', null, $2::jsonb)
			 on conflict (path) do nothing`,
			[CONFIG_PATH, JSON.stringify(generated)],
		);
		const persisted = await db.query("select data from app_documents where path = $1", [CONFIG_PATH]);
		keys = persisted.rows[0]?.data || generated;
	}
	cachedVapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
	return cachedVapid;
}

async function configureWebPush() {
	const keys = await getVapidKeys();
	const subject = text(process.env.WEB_PUSH_SUBJECT) || "mailto:sistema.retiradas@sempreinternet.com.br";
	webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
	return keys;
}

async function getPublicConfig() {
	const keys = await getVapidKeys();
	return { enabled: true, publicKey: keys.publicKey };
}

async function saveSubscription({ user = {}, subscription = {}, topics = {}, userAgent = "" } = {}) {
	const identity = userIdentity(user);
	const endpoint = text(subscription.endpoint);
	const p256dh = text(subscription.keys?.p256dh);
	const auth = text(subscription.keys?.auth);
	if (!identity.id && !identity.email) {
		const error = new Error("Usuario nao identificado.");
		error.statusCode = 401;
		throw error;
	}
	if (!endpoint || !p256dh || !auth) {
		const error = new Error("Assinatura push invalida.");
		error.statusCode = 400;
		throw error;
	}
	const id = `push_${crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}`;
	const result = await db.query(
		`insert into retiradas_push_subscriptions (
			id, endpoint, user_id, user_email, user_name, role, topics, p256dh, auth, user_agent, active
		) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,true)
		on conflict (endpoint) do update set
			user_id=excluded.user_id, user_email=excluded.user_email,
			user_name=excluded.user_name, role=excluded.role,
			topics=excluded.topics,
			p256dh=excluded.p256dh, auth=excluded.auth,
			user_agent=excluded.user_agent, active=true,
			failure_count=0, last_error=null, updated_at=now()
		returning id, active, created_at, updated_at`,
		[id, endpoint, identity.id || null, identity.email || null, identity.name || null, identity.role || null, JSON.stringify(topics || {}), p256dh, auth, text(userAgent)],
	);
	return { ok: true, subscription: result.rows[0] };
}

async function removeSubscription({ user = {}, endpoint = "" } = {}) {
	const identity = userIdentity(user);
	const result = await db.query(
		`update retiradas_push_subscriptions set active=false, updated_at=now()
		  where endpoint=$1 and (user_id=$2 or lower(coalesce(user_email,''))=$3)`,
		[text(endpoint), identity.id, identity.email],
	);
	return { ok: true, updated: result.rowCount };
}

function targetMatches(subscription, targets = {}) {
	if (targets.all === true) return true;
	const users = Array.isArray(targets.users) ? targets.users.map((item) => text(item).toLowerCase()) : [];
	const roles = Array.isArray(targets.roles) ? targets.roles.map((item) => text(item).toLowerCase()) : [];
	if (users.length && !users.includes(text(subscription.user_id).toLowerCase()) && !users.includes(text(subscription.user_email).toLowerCase())) return false;
	if (roles.length && !roles.includes(text(subscription.role).toLowerCase())) return false;
	return true;
}

function acceptsTopic(subscription, notification = {}) {
	const topic = text(notification.meta?.module || notification.meta?.topic).toLowerCase();
	if (!topic) return true;
	const topics = subscription.topics && typeof subscription.topics === "object" ? subscription.topics : {};
	return topics[topic] !== false;
}

async function recordEvent({ notificationId, userId = "", userEmail = "", eventType, channel = "IN_APP", dedupeKey = null, metadata = {} }) {
	return db.query(
		`insert into retiradas_notification_events (
			notification_id,user_id,user_email,event_type,channel,dedupe_key,metadata
		) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
		on conflict (dedupe_key) do nothing`,
		[text(notificationId), text(userId) || null, text(userEmail).toLowerCase() || null, text(eventType), text(channel), dedupeKey || null, JSON.stringify(metadata || {})],
	);
}

async function sendNotificationToTargets(notification = {}) {
	if (notification.meta?.pushEnabled === false) return { sent: 0, failed: 0, skipped: true };
	const targets = notification.targets || {};
	if (targets.all !== true && !targets.users?.length && !targets.roles?.length) return { selected: 0, sent: 0, failed: 0 };
	await configureWebPush();
	const subscriptions = await db.query("select * from retiradas_push_subscriptions where active=true");
	const selected = subscriptions.rows.filter((item) => targetMatches(item, targets) && acceptsTopic(item, notification));
	let sent = 0;
	let failed = 0;
	const payload = JSON.stringify({
		notification: {
			title: notification.title || "REVO",
			body: notification.message || "Você recebeu uma nova atualização.",
			icon: "/brand/revo/revo_app_icon_192px.png",
			badge: "/brand/revo/favicon_64.png",
		},
		data: {
			route: notification.targetPath || "/tentativas",
			notificationId: notification.id,
			type: notification.type || "geral",
		},
	});
	for (const item of selected) {
		try {
			await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, payload, { TTL: 3600 });
			sent += 1;
			await db.query("update retiradas_push_subscriptions set failure_count=0,last_success_at=now(),last_error=null,updated_at=now() where id=$1", [item.id]);
			await recordEvent({ notificationId: notification.id, userId: item.user_id, userEmail: item.user_email, eventType: "DELIVERED", channel: "PUSH", dedupeKey: `${notification.id}:${item.id}:delivered` });
		} catch (error) {
			failed += 1;
			const gone = error?.statusCode === 404 || error?.statusCode === 410;
			await db.query("update retiradas_push_subscriptions set active=case when $2 then false else active end,failure_count=failure_count+1,last_failure_at=now(),last_error=$3,updated_at=now() where id=$1", [item.id, gone, text(error?.message).slice(0, 500)]);
			await recordEvent({ notificationId: notification.id, userId: item.user_id, userEmail: item.user_email, eventType: "FAILED", channel: "PUSH", dedupeKey: `${notification.id}:${item.id}:failed`, metadata: { error: text(error?.message), statusCode: error?.statusCode || null } });
		}
	}
	return { selected: selected.length, sent, failed };
}

function normalizeTargetValues(values = []) {
	return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item).toLowerCase()).filter(Boolean))];
}

async function estimateAudience(targets = {}) {
	const users = normalizeTargetValues(targets.users);
	const roles = normalizeTargetValues(targets.roles);
	if (targets.all === true) {
		const result = await db.query("select count(*)::int total from app_users where disabled=false");
		return Number(result.rows[0]?.total || 0);
	}
	if (users.length) {
		const result = await db.query(
			`select count(*)::int total from app_users
			  where disabled=false and (lower(uid)=any($1::text[]) or lower(email)=any($1::text[]))`,
			[users],
		);
		return Number(result.rows[0]?.total || 0);
	}
	if (roles.length) {
		const result = await db.query(
			"select count(*)::int total from app_users where disabled=false and lower(role)=any($1::text[])",
			[roles],
		);
		return Number(result.rows[0]?.total || 0);
	}
	return 0;
}

async function listRecipients({ search = "", role = "", limit = 300 } = {}) {
	const normalizedSearch = text(search).toLowerCase().slice(0, 120);
	const normalizedRole = text(role).toLowerCase().slice(0, 80);
	const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 300, 1), 500);
	const result = await db.query(
		`select u.uid, u.email, u.display_name, u.role, u.regional,
		        count(s.id) filter (where s.active=true)::int active_devices
		   from app_users u
		   left join retiradas_push_subscriptions s
		     on s.user_id=u.uid or lower(s.user_email)=lower(u.email)
		  where u.disabled=false
		    and ($1='' or lower(u.role)=$1)
		    and ($2='' or lower(coalesce(u.display_name,'') || ' ' || coalesce(u.email,'')) like '%' || $2 || '%')
		  group by u.uid,u.email,u.display_name,u.role,u.regional
		  order by coalesce(u.display_name,u.email) asc
		  limit $3`,
		[normalizedRole, normalizedSearch, safeLimit],
	);
	return result.rows.map((item) => ({
		id: item.uid,
		email: item.email,
		name: item.display_name || item.email,
		role: item.role,
		regional: item.regional || "",
		activeDevices: Number(item.active_devices || 0),
	}));
}

async function saveCampaign({ notification, targetMode, targetValues, audienceCount, user = {} }) {
	const identity = userIdentity(user);
	const delivery = notification.pushDelivery || {};
	const result = await db.query(
		`insert into retiradas_push_campaigns (
			notification_id,title,message,severity,target_path,target_mode,target_values,
			audience_count,selected_devices,sent_devices,failed_devices,created_by_id,created_by_name
		 ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
		 returning *`,
		[
			notification.id,
			notification.title,
			notification.message,
			notification.severity || "info",
			notification.targetPath || null,
			targetMode,
			JSON.stringify(targetValues || []),
			Number(audienceCount || 0),
			Number(delivery.selected || 0),
			Number(delivery.sent || 0),
			Number(delivery.failed || 0),
			identity.id || null,
			identity.name || identity.email || null,
		],
	);
	return mapCampaign(result.rows[0]);
}

function mapCampaign(row = {}) {
	return {
		id: row.id,
		notificationId: row.notification_id,
		title: row.title,
		message: row.message,
		severity: row.severity,
		targetPath: row.target_path || "",
		targetMode: row.target_mode,
		targetValues: row.target_values || [],
		audienceCount: Number(row.audience_count || 0),
		selectedDevices: Number(row.selected_devices || 0),
		sentDevices: Number(row.sent_devices || 0),
		failedDevices: Number(row.failed_devices || 0),
		createdByName: row.created_by_name || "Sistema",
		createdAt: row.created_at,
	};
}

async function listCampaigns({ page = 1, limit = 20 } = {}) {
	const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 20, 1), 100);
	const safePage = Math.max(Math.trunc(Number(page)) || 1, 1);
	const offset = (safePage - 1) * safeLimit;
	const [items, count] = await Promise.all([
		db.query("select * from retiradas_push_campaigns order by created_at desc limit $1 offset $2", [safeLimit, offset]),
		db.query("select count(*)::int total from retiradas_push_campaigns"),
	]);
	const total = Number(count.rows[0]?.total || 0);
	return { items: items.rows.map(mapCampaign), page: safePage, limit: safeLimit, total, totalPages: Math.max(Math.ceil(total / safeLimit), 1) };
}

async function recordOpen({ user = {}, notificationId = "", channel = "IN_APP" } = {}) {
	const identity = userIdentity(user);
	await recordEvent({ notificationId, userId: identity.id, userEmail: identity.email, eventType: "OPENED", channel, dedupeKey: `${text(notificationId)}:${identity.id || identity.email}:${text(channel)}:opened` });
	return { ok: true };
}

async function recordRead({ user = {}, notificationIds = [] } = {}) {
	const identity = userIdentity(user);
	for (const notificationId of notificationIds) {
		await recordEvent({ notificationId, userId: identity.id, userEmail: identity.email, eventType: "READ", channel: "IN_APP", dedupeKey: `${text(notificationId)}:${identity.id || identity.email}:read` });
	}
}

async function getOverview() {
	const [subscriptions, users, recent] = await Promise.all([
		db.query(`select count(*)::int total,count(*) filter(where active)::int active,count(distinct coalesce(user_id,user_email)) filter(where active)::int users from retiradas_push_subscriptions`),
		db.query("select count(*)::int total from app_users where disabled=false"),
		db.query(`select event_type,channel,count(*)::int total from retiradas_notification_events where event_at>=now()-interval '7 days' group by event_type,channel order by event_type,channel`),
	]);
	return {
		...(subscriptions.rows[0] || { total: 0, active: 0, users: 0 }),
		allUsers: Number(users.rows[0]?.total || 0),
		recent: recent.rows,
	};
}

module.exports = {
	estimateAudience,
	getOverview,
	getPublicConfig,
	listCampaigns,
	listRecipients,
	recordEvent,
	recordOpen,
	recordRead,
	removeSubscription,
	saveSubscription,
	saveCampaign,
	sendNotificationToTargets,
};
