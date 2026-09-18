// Listagem de eventos do Calendario Financeiro (avulsos + ocorrencias
// expandidas das regras recorrentes), extraida de routes.js pra ser
// reaproveitada tambem pelo job de alertas (scripts/sendCalendarAlerts.js)
// — uma unica fonte de verdade pra "quais eventos existem num intervalo",
// sem duplicar a logica de expansao de regra em dois lugares que podem
// divergir.
const db = require("../db");
const {
	ensureNationalHolidaysForRange,
	getHolidaySet,
	nthBusinessDayOfMonth,
} = require("./holidaysService");

async function expandRuleOccurrences(from, to) {
	if (!from || !to) return [];
	// getHolidaySet (chamado abaixo, via holidaySetFor) calcula feriados
	// nacionais 100% localmente agora — nao depende mais deste
	// insert-no-banco pra a conta de dia util estar certa. Ainda gravamos
	// (best-effort, so pra manter finan_calendar_holidays preenchida pra
	// quem consultar direto), mas AGUARDANDO — o cache em memoria de
	// `ensuredYears` (holidaysService.js) torna isso essencialmente
	// instantaneo depois da primeira chamada por ano/processo. Um disparo
	// sem aguardar aqui ja causou "Cannot use a pool after calling end on
	// the pool" no job de alertas (scripts/sendCalendarAlerts.js), que
	// fecha o pool assim que `runCalendarAlerts()` resolve — sem esperar
	// essa escrita em segundo plano, que ainda estava em voo.
	await ensureNationalHolidaysForRange(from, to).catch((error) =>
		console.error("[finan-calendario-regras-feriados]", error?.message || error),
	);
	const { rows: rules } = await db.query(
		`select id, title, description, event_type, priority, alert_days_before, notify_role_ids,
			nth_business_day, business_day_city
		from finan_calendar_event_rules
		where active`,
	);
	if (!rules.length) return [];

	const fromDate = new Date(from);
	const toDate = new Date(to);
	const occurrences = [];

	const holidaySetsByCity = new Map();
	async function holidaySetFor(city) {
		const key = city || "__nacional__";
		if (!holidaySetsByCity.has(key)) {
			holidaySetsByCity.set(key, await getHolidaySet({ from, to, city: city || undefined }));
		}
		return holidaySetsByCity.get(key);
	}

	let cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
	const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
	while (cursor <= end) {
		for (const rule of rules) {
			const holidaySet = await holidaySetFor(rule.business_day_city);
			const occurrenceDate = nthBusinessDayOfMonth(
				cursor.getFullYear(),
				cursor.getMonth(),
				rule.nth_business_day,
				holidaySet,
			);
			if (occurrenceDate && occurrenceDate >= from && occurrenceDate <= to) {
				occurrences.push({
					id: `rule_${rule.id}_${occurrenceDate}`,
					rule_id: rule.id,
					title: rule.title,
					description: rule.description,
					event_date: occurrenceDate,
					event_type: rule.event_type,
					priority: rule.priority,
					alert_days_before: rule.alert_days_before || [],
					notify_role_ids: rule.notify_role_ids || [],
					created_by: null,
					responsible_user_id: null,
					responsible_name: null,
				});
			}
		}
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
	}
	return occurrences;
}

/** Eventos avulsos + ocorrencias de regra num intervalo [from, to] (YYYY-MM-DD), mesclados e ordenados por data. */
async function listEventsInRange(from, to) {
	const conditions = [];
	const params = [];
	if (from) {
		params.push(from);
		conditions.push(`event_date >= $${params.length}`);
	}
	if (to) {
		params.push(to);
		conditions.push(`event_date <= $${params.length}`);
	}
	const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

	// As duas buscas ficam isoladas de proposito: se a query dos eventos
	// avulsos falhar (ex.: coluna nova que nao terminou de migrar em
	// producao), isso NAO pode derrubar as ocorrencias de regra recorrente
	// tambem — ja aconteceu de "regra recorrente calculada certa mas nao
	// aparece em lugar nenhum" ser exatamente isso: uma excecao na primeira
	// query abortava a funcao inteira antes de chegar na segunda.
	const [singleEventsResult, ruleOccurrencesResult] = await Promise.allSettled([
		db.query(
			`select
				e.id, e.title, e.description, e.event_date, e.event_type, e.priority,
				e.alert_days_before, e.notify_role_ids, e.created_by, e.responsible_user_id,
				e.created_at, e.updated_at,
				u.name as responsible_name
			from finan_financial_events e
			left join finan_users u on u.id = e.responsible_user_id
			${where}
			order by e.event_date, e.created_at`,
			params,
		),
		expandRuleOccurrences(from, to),
	]);

	if (singleEventsResult.status === "rejected") {
		console.error("[finan-calendario-eventos-avulsos]", singleEventsResult.reason?.message || singleEventsResult.reason);
	}
	if (ruleOccurrencesResult.status === "rejected") {
		console.error("[finan-calendario-regras-expansao]", ruleOccurrencesResult.reason?.message || ruleOccurrencesResult.reason);
	}

	const rows = singleEventsResult.status === "fulfilled" ? singleEventsResult.value.rows : [];
	const ruleOccurrences = ruleOccurrencesResult.status === "fulfilled" ? ruleOccurrencesResult.value : [];
	return [...rows, ...ruleOccurrences].sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
}

/**
 * Proximas N ocorrencias de UMA regra (independente de intervalo de tela) —
 * usado no preview da lista de regras em Configurar calendario, pra dar
 * pra conferir visualmente se o calculo de dia util esta funcionando sem
 * precisar abrir o calendario no mes certo.
 */
async function computeNextOccurrences(rule, monthsAhead = 3) {
	const today = new Date();
	const from = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), "01"].join("-");
	const toDate = new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0);
	const to = [toDate.getFullYear(), String(toDate.getMonth() + 1).padStart(2, "0"), String(toDate.getDate()).padStart(2, "0")].join("-");

	await ensureNationalHolidaysForRange(from, to).catch(() => {});
	const holidaySet = await getHolidaySet({ from, to, city: rule.business_day_city || undefined });

	const occurrences = [];
	for (let offset = 0; offset <= monthsAhead; offset += 1) {
		const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1);
		const occurrenceDate = nthBusinessDayOfMonth(
			cursor.getFullYear(),
			cursor.getMonth(),
			rule.nth_business_day,
			holidaySet,
		);
		if (occurrenceDate) occurrences.push(occurrenceDate);
	}
	return occurrences;
}

module.exports = { computeNextOccurrences, expandRuleOccurrences, listEventsInRange };
