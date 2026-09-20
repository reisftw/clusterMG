const { randomId } = require("../secureRandom");

// Helper generico — nao especifico de nenhum dominio. O Operacao nao
// tinha sistema de notificacao interna ate a Fase D de Seguranca do
// Trabalho; fica pronto pra qualquer modulo futuro reaproveitar.
async function notifyUsers(client, { userIds, type, title, body, entityType, entityId, deepLink }) {
	const ids = Array.from(new Set((userIds || []).filter(Boolean)));
	for (const userId of ids) {
		await client.query(
			`insert into rot_notifications (id, user_id, type, title, body, entity_type, entity_id, deep_link)
			 values ($1,$2,$3,$4,$5,$6,$7,$8)`,
			[randomId("ntf"), userId, type, title, body || null, entityType || null, entityId || null, deepLink || null],
		);
	}
}

module.exports = { notifyUsers };
