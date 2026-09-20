// Job de alertas do Calendario Financeiro: por evento (avulso ou
// ocorrencia de regra recorrente), pra cada antecedencia marcada
// (alert_days_before), verifica se HOJE e o dia de avisar (data do evento
// menos N dias = hoje) e, se for, manda e-mail pra quem esta nos cargos
// marcados em notify_role_ids.
//
// Sem cargo marcado = sem e-mail (o evento continua visivel no
// calendario/resumo matinal pra todo mundo, mas nao dispara alerta
// "as cegas" pra empresa inteira so por existir).
//
// Idempotente: cada (evento, usuario, antecedencia) so e enviado uma vez,
// controlado por finan_calendar_event_notifications — rodar o job mais de
// uma vez no mesmo dia (ou reprocessar) nao reenvia.
const db = require("../db");
const { randomId } = require("../secureRandom");
const { sendCalendarEventAlertEmail } = require("../email/service");
const { sendPushToUser } = require("../push/pushService");
const notificationsService = require("../notifications/notificationsService");
const { listEventsInRange } = require("./eventsService");

function addDaysToDateString(dateStr, days) {
	const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() + days);
	return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function todayDateString() {
	const now = new Date();
	return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

/** Pura, testavel sem banco: quais pares (evento, diasDeAntecedencia) devem alertar hoje. */
function computeDueAlerts(events, todayStr) {
	const due = [];
	for (const event of events) {
		const leadDaysList = Array.isArray(event.alert_days_before) ? event.alert_days_before : [];
		const roleIds = Array.isArray(event.notify_role_ids) ? event.notify_role_ids : [];
		if (!roleIds.length) continue;
		for (const leadDays of leadDaysList) {
			if (addDaysToDateString(event.event_date, -leadDays) === todayStr) {
				due.push({ event, leadDays, roleIds });
			}
		}
	}
	return due;
}

function formatEventDateLabel(dateStr) {
	const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
	});
}

function formatLeadLabel(leadDays) {
	if (leadDays <= 0) return "hoje";
	if (leadDays === 1) return "faltando 1 dia";
	return `faltando ${leadDays} dias`;
}

async function usersForRoles(roleIds) {
	if (!roleIds.length) return [];
	const { rows } = await db.query(
		`select id, name, email, mfa_email
		from finan_users
		where status = 'ativo' and role_id = any($1::text[])`,
		[roleIds],
	);
	return rows;
}

async function alreadyNotified(eventKey, userId, leadDays) {
	const { rows } = await db.query(
		`select 1 from finan_calendar_event_notifications
		where event_key = $1 and user_id = $2 and lead_time_days = $3
		limit 1`,
		[eventKey, userId, leadDays],
	);
	return rows.length > 0;
}

async function recordNotification(eventKey, userId, leadDays) {
	await db
		.query(
			`insert into finan_calendar_event_notifications (id, event_key, user_id, lead_time_days)
			values ($1, $2, $3, $4)
			on conflict (event_key, user_id, lead_time_days) do nothing`,
			[randomId("finan_calendar_notif"), eventKey, userId, leadDays],
		)
		.catch((error) => console.error("[finan-calendario-alertas-registro]", error?.message || error));
}

/** Roda o job completo: busca eventos dos proximos ~60 dias, calcula quem precisa ser avisado hoje e envia. */
async function runCalendarAlerts({ lookaheadDays = 60 } = {}) {
	const today = todayDateString();
	const horizon = addDaysToDateString(today, lookaheadDays);
	const events = await listEventsInRange(today, horizon);
	const due = computeDueAlerts(events, today);

	let emailSent = 0;
	let pushSent = 0;
	let skipped = 0;
	let failed = 0;

	for (const { event, leadDays, roleIds } of due) {
		const eventKey = event.id;
		const users = await usersForRoles(roleIds);
		const eventDateLabel = formatEventDateLabel(event.event_date);
		const leadLabel = formatLeadLabel(leadDays);

		// So entra na Central de Notificacoes quem vence hoje/ja venceu
		// (leadDays <= 0) — antecedencias maiores (ex.: "faltam 5 dias") ja
		// chegam por e-mail/push, sem precisar tambem lotar o historico.
		// Uma notificacao por evento+antecedencia (nao por usuario), visivel
		// a todos os cargos marcados em notify_role_ids.
		if (leadDays <= 0) {
			await notificationsService
				.createNotification({
					type: "calendario_alerta",
					title: event.title,
					message: `Vence ${leadLabel === "hoje" ? "hoje" : leadLabel} — ${eventDateLabel}.`,
					severity: "warning",
					targetPath: "/calendario-financeiro",
					targets: { roleIds },
					dedupeKey: `finan_calendario_alerta_${eventKey}_${leadDays}`,
					meta: { eventId: event.id, leadDays },
				})
				.catch((error) =>
					console.error("[finan-calendario-alertas-notificacao]", error?.message || error),
				);
		}

		for (const user of users) {
			if (await alreadyNotified(eventKey, user.id, leadDays)) {
				skipped += 1;
				continue;
			}

			// E-mail e push sao independentes um do outro — um falhar (ou o
			// usuario nao ter e-mail/inscricao push) nao impede o outro. So
			// marca como "ja processado" (nunca mais tenta de novo) depois de
			// pelo menos TENTAR os dois, sucesso ou nao — isso e proposital:
			// nao ha fila de retry aqui, e reprocessar indefinidamente um
			// alerta cujo canal esta permanentemente quebrado (ex.: e-mail
			// invalido) so geraria log de erro repetido pra sempre.
			const target = user.mfa_email || user.email;
			if (target) {
				try {
					const result = await sendCalendarEventAlertEmail({
						to: target,
						name: user.name,
						eventTitle: event.title,
						eventDateLabel,
						diasAntecedencia: leadDays,
						diasLabel: leadLabel,
					});
					if (result?.sent) emailSent += 1;
					else failed += 1;
				} catch (error) {
					failed += 1;
					console.error("[finan-calendario-alertas-envio-email]", error?.message || error);
				}
			}

			try {
				const pushResult = await sendPushToUser(user.id, {
					title: event.title,
					body: `${leadLabel} — ${eventDateLabel}`,
					url: "/calendario-financeiro",
					eventId: event.id,
				});
				pushSent += pushResult?.sent || 0;
			} catch (error) {
				console.error("[finan-calendario-alertas-envio-push]", error?.message || error);
			}

			await recordNotification(eventKey, user.id, leadDays);
		}
	}

	return { checked: events.length, dueCount: due.length, emailSent, pushSent, skipped, failed };
}

module.exports = {
	addDaysToDateString,
	computeDueAlerts,
	formatEventDateLabel,
	formatLeadLabel,
	runCalendarAlerts,
	todayDateString,
};
