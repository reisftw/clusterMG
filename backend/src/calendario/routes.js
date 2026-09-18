// Calendario Financeiro (Fase 1 do roadmap): CRUD de eventos avulsos +
// regras de recorrencia por dia util + configuracoes (tipos, prioridades,
// antecedencia de alerta, feriados). Visualizar (eventos, feriados,
// catalogos) e aberto a qualquer usuario autenticado — o calendario e
// pensado como ponto de entrada do dia a dia. Criar/editar/excluir
// (eventos, regras, catalogos, feriados municipais) exige
// finan.calendario.manage.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { randomId } = require("../secureRandom");
const {
	computeNationalHolidaysForRange,
	ensureNationalHolidaysForRange,
	listHolidays,
} = require("./holidaysService");
const { computeNextOccurrences, listEventsInRange } = require("./eventsService");
const { validate } = require("../dtos/middleware");
const { IdParamDTO } = require("../dtos/userDto");
const {
	PRIORITY_COLORS,
	EventShapeDTO,
	RuleShapeDTO,
	HolidayShapeDTO,
	PriorityColorDTO,
	LeadTimeDaysDTO,
} = require("../dtos/calendarioDto");

const router = express.Router();
const manage = requireFinanPermission("finan.calendario.manage");

function requireDateRange(query) {
	const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : null;
	const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : null;
	return { from, to };
}

// Os DTOs de evento/regra ja validam que cada item de
// `alertDaysBefore`/`notifyRoleIds` tem o tipo/intervalo certo (item invalido
// vira erro 400, nao e mais silenciosamente descartado como antes). Aqui so
// deduplicamos/ordenamos o array ja validado.
function dedupeSortedNumbers(values = []) {
	return Array.from(new Set(values)).sort((a, b) => a - b);
}

function dedupeStrings(values = []) {
	return Array.from(new Set(values));
}

async function assertKnownTypeAndPriority(eventType, priority) {
	const { rows } = await db.query(
		`select
			(select count(*) from finan_calendar_event_types where id = $1 and active) as type_count,
			(select count(*) from finan_calendar_priorities where id = $2 and active) as priority_count`,
		[eventType, priority],
	);
	if (!Number(rows[0]?.type_count) || !Number(rows[0]?.priority_count)) {
		const error = new Error("Tipo ou prioridade inválidos.");
		error.status = 400;
		throw error;
	}
}

// Resolve os aliases camelCase/snake_case que o front pode mandar, ANTES de
// validar — o DTO valida o objeto ja com nomes canonicos (ver
// `dtos/calendarioDto.js` para o porque).
function resolveEventShape(body = {}) {
	return {
		title: body.title,
		description: body.description,
		eventDate: body.eventDate || body.event_date,
		eventType: body.eventType || body.event_type,
		priority: body.priority,
		responsibleUserId: body.responsibleUserId || body.responsible_user_id,
		alertDaysBefore: body.alertDaysBefore || body.alert_days_before,
		notifyRoleIds: body.notifyRoleIds || body.notify_role_ids,
	};
}

function normalizeEventPayload(body = {}) {
	const dto = EventShapeDTO(resolveEventShape(body));
	return {
		title: dto.title,
		description: dto.description ?? null,
		eventDate: dto.eventDate,
		eventType: dto.eventType,
		priority: dto.priority,
		responsibleUserId: dto.responsibleUserId ?? null,
		alertDaysBefore: dedupeSortedNumbers(dto.alertDaysBefore),
		notifyRoleIds: dedupeStrings(dto.notifyRoleIds),
	};
}

// -------- Catálogos (tipos, prioridades, antecedências) --------

// `extraValidators` (opcional): `{ nomeDaColuna: validador }` — cada
// validador tem a forma `(raw) => { value, error }` de `dtos/schema.js`.
// Achado do mapeamento de DTOs: a cor de `finan_calendar_priorities`
// (`color`) nunca foi validada contra as cores realmente suportadas pelo
// front (`PRIORITY_COLORS`) — aceitava qualquer string.
function catalogRouter(table, { extraColumns = [], extraDefaults = {}, extraValidators = {} } = {}) {
	const sub = express.Router();
	const columns = ["id", "label", "active", ...extraColumns];

	sub.get("/", async (_req, res, next) => {
		try {
			const { rows } = await db.query(
				`select ${columns.join(", ")} from ${table} where active order by label`,
			);
			res.json({ ok: true, items: rows });
		} catch (error) {
			next(error);
		}
	});

	sub.post("/", manage, async (req, res, next) => {
		try {
			const label = String(req.body?.label || "").trim();
			if (!label) {
				res.status(400).json({ ok: false, error: "Informe um nome." });
				return;
			}
			const id = String(req.body?.id || label)
				.trim()
				.toLowerCase()
				.normalize("NFD")
				.replace(/[̀-ͯ]/g, "")
				.replace(/[^a-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "");
			if (!id) {
				res.status(400).json({ ok: false, error: "Nome inválido." });
				return;
			}
			const extraValues = [];
			for (const column of extraColumns) {
				const raw = req.body?.[column];
				const validator = extraValidators[column];
				if (raw === undefined || raw === null || raw === "") {
					extraValues.push(extraDefaults[column] ?? null);
					continue;
				}
				if (validator) {
					const { value, error } = validator(raw);
					if (error) {
						res.status(400).json({
							ok: false,
							error: "Dados inválidos.",
							code: "VALIDATION_ERROR",
							fields: { [column]: error },
						});
						return;
					}
					extraValues.push(value);
				} else {
					extraValues.push(raw);
				}
			}
			const { rows } = await db.query(
				`insert into ${table} (id, label${extraColumns.length ? ", " + extraColumns.join(", ") : ""})
				values ($1, $2${extraColumns.map((_, index) => `, $${index + 3}`).join("")})
				on conflict (id) do update set label = excluded.label, active = true
				returning ${columns.join(", ")}`,
				[id, label, ...extraValues],
			);
			res.json({ ok: true, item: rows[0] });
		} catch (error) {
			next(error);
		}
	});

	sub.delete("/:id", manage, validate({ params: IdParamDTO }), async (req, res, next) => {
		try {
			// Soft-delete (active=false): eventos ja criados apontando pra
			// esse tipo/prioridade/antecedencia continuam existindo e legiveis.
			await db.query(`update ${table} set active = false where id = $1`, [req.validated.params.id]);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	return sub;
}

router.use("/config/tipos", catalogRouter("finan_calendar_event_types"));
router.use(
	"/config/prioridades",
	catalogRouter("finan_calendar_priorities", {
		extraColumns: ["color"],
		extraDefaults: { color: "azul" },
		extraValidators: { color: PriorityColorDTO },
	}),
);
router.use(
	"/config/antecedencias",
	(req, _res, next) => {
		// dias e obrigatorio e so faz sentido no POST — valida aqui antes do
		// catalogRouter generico (que so sabe lidar com "label").
		if (req.method === "POST") {
			const { value: days, error: daysError } = LeadTimeDaysDTO(req.body?.days);
			if (daysError) {
				next(Object.assign(new Error("Informe um número de dias válido (1 a 365)."), { status: 400 }));
				return;
			}
			req.body.days = days;
			req.body.label = req.body.label || `${days} dia(s) antes`;
			req.body.id = req.body.id || `lead_${days}`;
		}
		next();
	},
	catalogRouter("finan_calendar_lead_times", {
		extraColumns: ["days"],
		extraDefaults: { days: null },
	}),
);

router.get("/config/cores-disponiveis", async (_req, res, next) => {
	try {
		res.json({ ok: true, colors: PRIORITY_COLORS });
	} catch (error) {
		next(error);
	}
});

// -------- Feriados --------

router.get("/feriados", async (req, res, next) => {
	try {
		const { from, to } = requireDateRange(req.query);
		const city = req.query.city ? String(req.query.city).trim() : null;
		// Feriados nacionais vem do calculo local (nunca falha, nunca depende
		// do banco ja ter sido sincronizado — ver holidaysService.js). Ainda
		// tentamos gravar no banco (best-effort, so pra fins de auditoria/
		// consulta direta na tabela), mas a RESPOSTA nao depende do resultado
		// dessa gravacao (erro aqui e so logado, nunca vira 500).
		//
		// Aguardamos (em vez de "fire-and-forget") de proposito: o cache em
		// memoria de `ensuredYears` (holidaysService.js) faz isso ser
		// essencialmente instantaneo depois da primeira chamada por ano/
		// processo, e um disparo sem aguardar ja causou "Cannot use a pool
		// after calling end on the pool" no job de alertas
		// (scripts/sendCalendarAlerts.js), que fecha o pool assim que a
		// funcao principal termina — sem esperar essa escrita em segundo
		// plano, que ainda estava em voo.
		if (from && to) {
			await ensureNationalHolidaysForRange(from, to).catch((error) =>
				console.error("[finan-calendario-feriados-persistencia]", error?.message || error),
			);
		}
		const nationalHolidays = computeNationalHolidaysForRange(from, to);
		const municipalHolidays = (await listHolidays({ from, to, city }).catch(() => [])).filter(
			(item) => item.scope === "municipal",
		);
		const holidays = [...nationalHolidays, ...municipalHolidays].sort((a, b) =>
			String(a.holiday_date).localeCompare(String(b.holiday_date)),
		);
		res.json({ ok: true, holidays });
	} catch (error) {
		next(error);
	}
});

router.post("/feriados", manage, async (req, res, next) => {
	try {
		const dto = HolidayShapeDTO({
			holidayDate: req.body?.date || req.body?.holidayDate,
			name: req.body?.name,
			city: req.body?.city,
		});
		const { rows } = await db.query(
			`insert into finan_calendar_holidays (id, holiday_date, name, scope, city, source)
			values ($1, $2, $3, 'municipal', $4, 'manual')
			on conflict (holiday_date, scope, coalesce(city, '')) do update set name = excluded.name
			returning id, holiday_date, name, scope, city, source`,
			[randomId("finan_holiday"), dto.holidayDate, dto.name, dto.city],
		);
		res.json({ ok: true, holiday: rows[0] });
	} catch (error) {
		next(error);
	}
});

router.delete("/feriados/:id", manage, validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query("delete from finan_calendar_holidays where id = $1 and scope = 'municipal'", [
			req.validated.params.id,
		]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// -------- Regras de recorrência (N-ésimo dia útil do mês) --------

function resolveRuleShape(body = {}) {
	return {
		title: body.title,
		description: body.description,
		eventType: body.eventType || body.event_type,
		priority: body.priority,
		nthBusinessDay: body.nthBusinessDay ?? body.nth_business_day,
		businessDayCity: body.businessDayCity || body.business_day_city,
		alertDaysBefore: body.alertDaysBefore || body.alert_days_before,
		notifyRoleIds: body.notifyRoleIds || body.notify_role_ids,
	};
}

function normalizeRulePayload(body = {}) {
	const dto = RuleShapeDTO(resolveRuleShape(body));
	return {
		title: dto.title,
		description: dto.description ?? null,
		eventType: dto.eventType,
		priority: dto.priority,
		nthBusinessDay: dto.nthBusinessDay,
		businessDayCity: dto.businessDayCity ?? null,
		alertDaysBefore: dedupeSortedNumbers(dto.alertDaysBefore),
		notifyRoleIds: dedupeStrings(dto.notifyRoleIds),
	};
}

router.get("/regras", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, title, description, event_type, priority, alert_days_before, notify_role_ids,
				rule_type, nth_business_day, business_day_city, active, created_at, updated_at
			from finan_calendar_event_rules
			where active
			order by title`,
		);
		// Preview das proximas ocorrencias calculadas — da pra conferir na
		// hora se o calculo de dia util esta certo, sem precisar navegar o
		// calendario ate o mes certo.
		const rules = await Promise.all(
			rows.map(async (rule) => ({
				...rule,
				next_occurrences: await computeNextOccurrences(rule).catch(() => []),
			})),
		);
		res.json({ ok: true, rules });
	} catch (error) {
		next(error);
	}
});

router.post("/regras", manage, async (req, res, next) => {
	try {
		const payload = normalizeRulePayload(req.body);
		await assertKnownTypeAndPriority(payload.eventType, payload.priority);
		const id = randomId("finan_rule");
		const { rows } = await db.query(
			`insert into finan_calendar_event_rules (
				id, title, description, event_type, priority, alert_days_before,
				nth_business_day, business_day_city, notify_role_ids, created_by
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			returning id, title, description, event_type, priority, alert_days_before, notify_role_ids,
				rule_type, nth_business_day, business_day_city, active, created_at, updated_at`,
			[
				id,
				payload.title,
				payload.description,
				payload.eventType,
				payload.priority,
				payload.alertDaysBefore,
				payload.nthBusinessDay,
				payload.businessDayCity,
				payload.notifyRoleIds,
				req.finanUser.id,
			],
		);
		res.json({ ok: true, rule: rows[0] });
	} catch (error) {
		next(error);
	}
});

router.patch(
	"/regras/:id",
	manage,
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			const payload = normalizeRulePayload(req.body);
			await assertKnownTypeAndPriority(payload.eventType, payload.priority);
			const { rows } = await db.query(
				`update finan_calendar_event_rules
				set title = $1, description = $2, event_type = $3, priority = $4,
					alert_days_before = $5, nth_business_day = $6, business_day_city = $7,
					notify_role_ids = $8, updated_at = now()
				where id = $9
				returning id, title, description, event_type, priority, alert_days_before, notify_role_ids,
					rule_type, nth_business_day, business_day_city, active, created_at, updated_at`,
				[
					payload.title,
					payload.description,
					payload.eventType,
					payload.priority,
					payload.alertDaysBefore,
					payload.nthBusinessDay,
					payload.businessDayCity,
					payload.notifyRoleIds,
					req.validated.params.id,
				],
			);
			if (!rows.length) {
				res.status(404).json({ ok: false, error: "Regra não encontrada." });
				return;
			}
			res.json({ ok: true, rule: rows[0] });
		} catch (error) {
			next(error);
		}
	},
);

router.delete("/regras/:id", manage, validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query("update finan_calendar_event_rules set active = false where id = $1", [
			req.validated.params.id,
		]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

// -------- Eventos avulsos (+ expansão das regras dentro do intervalo) --------

router.get("/", async (req, res, next) => {
	try {
		const { from, to } = requireDateRange(req.query);
		const events = await listEventsInRange(from, to);
		res.json({ ok: true, events });
	} catch (error) {
		next(error);
	}
});

router.post("/", manage, async (req, res, next) => {
	try {
		const payload = normalizeEventPayload(req.body);
		await assertKnownTypeAndPriority(payload.eventType, payload.priority);
		const id = randomId("finan_event");
		const { rows } = await db.query(
			`insert into finan_financial_events (
				id, title, description, event_date, event_type, priority,
				alert_days_before, notify_role_ids, created_by, responsible_user_id
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			returning id, title, description, event_date, event_type, priority,
				alert_days_before, notify_role_ids, created_by, responsible_user_id, created_at, updated_at`,
			[
				id,
				payload.title,
				payload.description,
				payload.eventDate,
				payload.eventType,
				payload.priority,
				payload.alertDaysBefore,
				payload.notifyRoleIds,
				req.finanUser.id,
				payload.responsibleUserId,
			],
		);
		res.json({ ok: true, event: rows[0] });
	} catch (error) {
		next(error);
	}
});

router.patch("/:id", manage, validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const payload = normalizeEventPayload(req.body);
		await assertKnownTypeAndPriority(payload.eventType, payload.priority);
		const { rows } = await db.query(
			`update finan_financial_events
			set title = $1, description = $2, event_date = $3, event_type = $4,
				priority = $5, responsible_user_id = $6, alert_days_before = $7,
				notify_role_ids = $8, updated_at = now()
			where id = $9
			returning id, title, description, event_date, event_type, priority,
				alert_days_before, notify_role_ids, created_by, responsible_user_id, created_at, updated_at`,
			[
				payload.title,
				payload.description,
				payload.eventDate,
				payload.eventType,
				payload.priority,
				payload.responsibleUserId,
				payload.alertDaysBefore,
				payload.notifyRoleIds,
				req.validated.params.id,
			],
		);
		if (!rows.length) {
			res.status(404).json({ ok: false, error: "Evento não encontrado." });
			return;
		}
		res.json({ ok: true, event: rows[0] });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", manage, validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query("delete from finan_financial_events where id = $1", [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
