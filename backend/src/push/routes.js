// Web Push: chave publica (pra qualquer usuario autenticado montar a
// inscricao no navegador), inscrever/desinscrever o PROPRIO dispositivo.
// Nao precisa de finan.calendario.manage nem nenhuma outra permissao
// especial — e uma preferencia pessoal de cada usuario, igual notify_role_ids
// so controla QUEM e elegivel a receber, nao quem pode se inscrever.
// requireFinanAuth ja roda globalmente antes deste router (ver app.js),
// entao req.finanUser ja vem pronto — nao reaplicamos o middleware aqui.
const express = require("express");
const {
	getVapidPublicKey,
	hasActiveSubscription,
	isPushEnabled,
	removeSubscription,
	saveSubscription,
} = require("./pushService");

const router = express.Router();

router.get("/vapid-public-key", (_req, res) => {
	res.json({ ok: true, enabled: isPushEnabled(), publicKey: getVapidPublicKey() });
});

router.get("/status", async (req, res, next) => {
	try {
		const subscribed = await hasActiveSubscription(req.finanUser.id);
		res.json({ ok: true, enabled: isPushEnabled(), subscribed });
	} catch (error) {
		next(error);
	}
});

router.post("/subscribe", async (req, res, next) => {
	try {
		await saveSubscription(req.finanUser.id, req.body?.subscription);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

router.post("/unsubscribe", async (req, res, next) => {
	try {
		const endpoint = String(req.body?.endpoint || "");
		if (!endpoint) {
			res.status(400).json({ ok: false, error: "Informe o endpoint da inscrição." });
			return;
		}
		await removeSubscription(req.finanUser.id, endpoint);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
