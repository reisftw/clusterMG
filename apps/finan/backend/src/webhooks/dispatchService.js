// Roteiro Finan #47 (Fase 4F — Webhooks): dispara eventos pra
// automações externas. Melhor esforço — uma falha de rede num webhook
// externo nunca pode quebrar a ação real do sistema (fechar período,
// salvar fornecedor, etc.), por isso dispatchEvent nunca lança, só loga.
const crypto = require("node:crypto");
const db = require("../db");
const { randomId } = require("../secureRandom");

const EVENTOS_SUPORTADOS = ["supplier.updated", "budget.threshold_reached", "month.closed", "invoice.created"];

function assinarPayload(secreto, body) {
	return crypto.createHmac("sha256", secreto).update(body).digest("hex");
}

async function dispatchEvent(eventType, payload) {
	if (!EVENTOS_SUPORTADOS.includes(eventType)) return;
	try {
		const { rows } = await db.query(
			`select * from finan_webhooks where ativo = true and $1 = any(eventos)`,
			[eventType],
		);
		if (!rows.length) return;
		const body = JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() });
		await Promise.all(
			rows.map(async (webhook) => {
				const assinatura = assinarPayload(webhook.secreto, body);
				let statusCode = null;
				try {
					const response = await fetch(webhook.url, {
						method: "POST",
						headers: { "Content-Type": "application/json", "X-Finan-Signature": assinatura, "X-Finan-Event": eventType },
						body,
						signal: AbortSignal.timeout(10000),
					});
					statusCode = response.status;
				} catch (error) {
					console.error(`[finan-webhooks] falha ao chamar ${webhook.url}:`, error?.message || error);
				}
				await db
					.query(`update finan_webhooks set ultima_execucao_em = now(), ultimo_status_code = $2 where id = $1`, [
						webhook.id,
						statusCode,
					])
					.catch(() => {});
			}),
		);
	} catch (error) {
		console.error("[finan-webhooks] falha ao despachar evento:", eventType, error?.message || error);
	}
}

function publicWebhook(row) {
	return {
		id: row.id,
		url: row.url,
		eventos: row.eventos || [],
		ativo: row.ativo,
		ultimaExecucaoEm: row.ultima_execucao_em,
		ultimoStatusCode: row.ultimo_status_code,
		createdByNome: row.created_by_nome,
		createdAt: row.created_at,
	};
}

async function listWebhooks() {
	const { rows } = await db.query(`select * from finan_webhooks order by created_at desc`);
	return rows.map(publicWebhook);
}

async function createWebhook({ url, eventos, createdBy }) {
	const eventosValidos = (eventos || []).filter((e) => EVENTOS_SUPORTADOS.includes(e));
	const id = randomId("webhook");
	const secreto = crypto.randomBytes(24).toString("hex");
	const { rows } = await db.query(
		`insert into finan_webhooks (id, url, eventos, secreto, created_by_id, created_by_nome)
		values ($1, $2, $3::text[], $4, $5, $6)
		returning *`,
		[id, url, eventosValidos, secreto, createdBy?.id || null, createdBy?.name || null],
	);
	// So no create devolve o secreto (o usuario precisa dele pra validar a
	// assinatura no destino) — listagens depois nunca reexpoem.
	return { ...publicWebhook(rows[0]), secreto };
}

async function updateWebhook(id, { ativo, eventos }) {
	const eventosValidos = eventos ? eventos.filter((e) => EVENTOS_SUPORTADOS.includes(e)) : null;
	const { rows } = await db.query(
		`update finan_webhooks set
			ativo = coalesce($2, ativo),
			eventos = coalesce($3::text[], eventos)
		where id = $1
		returning *`,
		[id, ativo ?? null, eventosValidos],
	);
	if (!rows[0]) {
		const error = new Error("Webhook não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	return publicWebhook(rows[0]);
}

async function deleteWebhook(id) {
	await db.query(`delete from finan_webhooks where id = $1`, [id]);
}

module.exports = { EVENTOS_SUPORTADOS, dispatchEvent, listWebhooks, createWebhook, updateWebhook, deleteWebhook };
