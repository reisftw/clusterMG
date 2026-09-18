// Web Push (VAPID) — inscricao por dispositivo/navegador + envio. Chaves
// vem de env (FINAN_VAPID_PUBLIC_KEY/FINAN_VAPID_PRIVATE_KEY, geradas uma
// vez com webpush.generateVAPIDKeys() e guardadas so no .env da VPS,
// nunca no repositorio). Sem chave configurada, push fica desativado sem
// quebrar o resto do Finan (mesmo espirito do e-mail: FINAN_SMTP_* ausente
// so desativa o envio, nao derruba a aplicacao).
const webpush = require("web-push");
const db = require("../db");
const { randomId } = require("../secureRandom");

let configured = false;

function ensureConfigured() {
	if (configured) return true;
	const publicKey = process.env.FINAN_VAPID_PUBLIC_KEY;
	const privateKey = process.env.FINAN_VAPID_PRIVATE_KEY;
	if (!publicKey || !privateKey) return false;
	const subject = process.env.FINAN_VAPID_SUBJECT || "mailto:financeiro@retiradas.tech";
	webpush.setVapidDetails(subject, publicKey, privateKey);
	configured = true;
	return true;
}

function isPushEnabled() {
	return ensureConfigured();
}

function getVapidPublicKey() {
	return process.env.FINAN_VAPID_PUBLIC_KEY || "";
}

async function saveSubscription(userId, subscription) {
	const endpoint = String(subscription?.endpoint || "");
	const p256dh = String(subscription?.keys?.p256dh || "");
	const auth = String(subscription?.keys?.auth || "");
	if (!endpoint || !p256dh || !auth) {
		const error = new Error("Inscrição de push inválida.");
		error.status = 400;
		throw error;
	}
	await db.query(
		`insert into finan_push_subscriptions (id, user_id, endpoint, p256dh, auth)
		values ($1, $2, $3, $4, $5)
		on conflict (endpoint) do update set
			user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()`,
		[randomId("finan_push"), userId, endpoint, p256dh, auth],
	);
}

async function removeSubscription(userId, endpoint) {
	await db.query("delete from finan_push_subscriptions where user_id = $1 and endpoint = $2", [
		userId,
		endpoint,
	]);
}

async function hasActiveSubscription(userId) {
	const { rows } = await db.query(
		"select count(*)::int as total from finan_push_subscriptions where user_id = $1",
		[userId],
	);
	return Number(rows[0]?.total) > 0;
}

/** Manda push pra TODAS as inscricoes ativas de um usuario. Remove sozinho inscricoes mortas (404/410 do provedor). */
async function sendPushToUser(userId, payload) {
	if (!ensureConfigured()) return { sent: 0, skipped: "push_not_configured" };
	const { rows: subscriptions } = await db.query(
		"select id, endpoint, p256dh, auth from finan_push_subscriptions where user_id = $1",
		[userId],
	);
	let sent = 0;
	for (const row of subscriptions) {
		const subscription = {
			endpoint: row.endpoint,
			keys: { p256dh: row.p256dh, auth: row.auth },
		};
		try {
			await webpush.sendNotification(subscription, JSON.stringify(payload));
			sent += 1;
		} catch (error) {
			// 404/410 = inscricao expirada/revogada pelo navegador — limpa.
			// Qualquer outro erro so loga, sem derrubar o job de alertas.
			if (error?.statusCode === 404 || error?.statusCode === 410) {
				await db
					.query("delete from finan_push_subscriptions where id = $1", [row.id])
					.catch(() => {});
			} else {
				console.error("[finan-push-envio]", error?.message || error);
			}
		}
	}
	return { sent };
}

module.exports = {
	getVapidPublicKey,
	hasActiveSubscription,
	isPushEnabled,
	removeSubscription,
	saveSubscription,
	sendPushToUser,
};
