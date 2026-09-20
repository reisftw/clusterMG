const express = require("express");
const db = require("../db");
const { auditLog } = require("../audit/auditLog");
const { requireRotAuth, requireRotPermission, userHasRotPermission } = require("../auth/middleware");
const { randomId } = require("../secureRandom");
const { noStore } = require("../security/noStore");
const { notifyUsers } = require("../notifications/helpers");
const { myTeamClause, dssVisibilityClause, generateExecutionsForSchedule, findUsersWithPermission } = require("./helpers");

// Fase 1 do dominio DSS (Dialogo Semanal de Seguranca), dentro de
// Seguranca do Trabalho: Temas -> Programacao -> geracao automatica de
// Execucoes (leitura). Registro de presenca/evidencia/validacao/
// dashboard/relatorios/notificacoes sao fases seguintes — o schema ja
// esta pronto pra elas (054_dss_schema.sql), so as rotas ainda nao.
//
// Mesmo estilo do SST (backend/src/sst/routes.js): sem controller/
// service/repository, SQL inline, transacao manual em toda escrita.

const router = express.Router();
router.use(requireRotAuth, noStore);

function fail(status, message) {
	const error = new Error(message);
	error.status = status;
	throw error;
}

function nullableText(value, max = 2000) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

// Paginacao padrao das listagens do DSS (feedback de producao: limitar
// a partir de 30 pra nao crescer sem controle). Mesmo padrao de
// page/pageSize/total do /reports/details.
function parsePagination(query, defaultSize = 30, maxSize = 100) {
	const page = Math.max(1, Number(query.page) || 1);
	const pageSize = Math.min(maxSize, Math.max(1, Number(query.pageSize) || defaultSize));
	return { page, pageSize, offset: (page - 1) * pageSize };
}

// Categoria deixou de ser enum fixo no codigo (feedback de producao: o
// gestor de SST quer configurar isso pelo sistema) — vira consulta a
// dss_categories (056_dss_categories.sql), validada em cada escrita.
async function isActiveCategory(id) {
	const { rows } = await db.query("select 1 from dss_categories where id = $1 and active = true", [id]);
	return rows.length > 0;
}
const MODALITIES = ["semanal", "mensal"];
const CONTENT_TYPES = ["editor", "pdf"];
const THEME_STATUSES = ["rascunho", "publicado", "arquivado"];
const SCHEDULE_STATUSES = ["rascunho", "publicado", "cancelado"];
const EXECUTION_STATUSES = ["planejado", "disponivel", "em_andamento", "enviado", "validado", "rejeitado", "cancelado"];
const OPERATION_TYPES = ["ROT", "FIELD", "DELIVERY"];
const PRESENCE_STATUSES = ["pendente", "presente", "ausente"];
const ABSENCE_REASONS = ["ferias", "afastamento", "folga", "atestado", "ausencia_operacional", "outro"];
// Integridade historica (secao 37 do pedido): depois de enviada ou
// validada, a execucao nao aceita mais edicao de presenca/evidencia —
// "enviado" so volta a ser editavel se o SST rejeitar (-> 'rejeitado').
const EXECUTION_EDITABLE_STATUSES = ["planejado", "disponivel", "em_andamento", "rejeitado"];

function sanitizeContentBlocks(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((block) => block && typeof block === "object" && typeof block.type === "string")
		.slice(0, 200)
		.map((block) => ({
			type: String(block.type).slice(0, 40),
			text: nullableText(block.text, 4000) || "",
			items: Array.isArray(block.items) ? block.items.map((item) => nullableText(item, 500) || "").filter(Boolean).slice(0, 50) : undefined,
		}));
}

function publicTheme(row, weeks = null) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		objective: row.objective,
		category: row.category,
		notes: row.notes,
		modality: row.modality,
		contentType: row.content_type,
		contentBlocks: row.content_blocks,
		status: row.status,
		authorId: row.author_id,
		authorName: row.author_name || null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		weeks: weeks ? weeks.map(publicThemeWeek) : undefined,
	};
}

function publicThemeWeek(row) {
	return {
		id: row.id,
		themeId: row.theme_id,
		weekNumber: row.week_number,
		title: row.title,
		contentType: row.content_type,
		contentBlocks: row.content_blocks,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function publicSchedule(row, scopes = null, executions = null) {
	return {
		id: row.id,
		themeId: row.theme_id,
		themeWeekId: row.theme_week_id,
		themeTitle: row.theme_title || null,
		weekLabel: row.week_label,
		startDate: row.start_date,
		endDate: row.end_date,
		dueDate: row.due_date,
		status: row.status,
		createdBy: row.created_by,
		publishedAt: row.published_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		scopes: scopes ? scopes.map(publicScope) : undefined,
		executions: executions ? executions.map((execution) => publicExecution(execution)) : undefined,
	};
}

function publicScope(row) {
	return {
		id: row.id,
		operationType: row.operation_type,
		regionalId: row.regional_id,
		regionalName: row.regional_name || null,
		baseId: row.base_id,
		baseName: row.base_name || null,
		roleId: row.role_id,
		roleName: row.role_name || null,
	};
}

// "atrasado" e calculado na leitura (sem cron): execucao ainda nao
// enviada e com prazo vencido.
const EXECUTION_STATUS_EXPR = `case when e.status in ('planejado','disponivel','em_andamento') and e.due_date < current_date then 'atrasado' else e.status end`;

function publicExecution(row, members = null, timeline = null) {
	return {
		id: row.id,
		scheduleId: row.schedule_id,
		themeId: row.theme_id,
		themeTitle: row.theme_title || null,
		themeWeekId: row.theme_week_id,
		weekLabel: row.week_label,
		operationType: row.operation_type,
		regionalId: row.regional_id,
		regionalName: row.regional_name || null,
		baseId: row.base_id,
		baseName: row.base_name || null,
		responsibleId: row.responsible_id,
		responsibleName: row.responsible_name || null,
		dueDate: row.due_date,
		status: row.effective_status || row.status,
		previstosCount: row.previstos_count,
		presentesCount: row.presentes_count,
		ausentesCount: row.ausentes_count,
		participationPct: row.participation_pct,
		submittedBy: row.submitted_by,
		submittedAt: row.submitted_at,
		validatedBy: row.validated_by,
		validatedAt: row.validated_at,
		validationNote: row.validation_note,
		rejectionReason: row.rejection_reason,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		members: members ? members.map(publicExecutionMember) : undefined,
		timeline: timeline ? timeline.map(publicTimelineEvent) : undefined,
	};
}

function publicExecutionMember(row) {
	return {
		id: row.id,
		userId: row.user_id,
		tecnicoId: row.tecnico_id,
		name: row.name_snapshot,
		role: row.role_snapshot,
		regional: row.regional_snapshot,
		base: row.base_snapshot,
		presenceStatus: row.presence_status,
		absenceReason: row.absence_reason,
		absenceNote: row.absence_note,
	};
}

function publicTimelineEvent(row) {
	return {
		id: row.id,
		eventType: row.event_type,
		title: row.title,
		description: row.description,
		createdBy: row.created_by,
		createdAt: row.created_at,
	};
}

// ---------------------------------------------------------------------
// Categorias de tema — configuráveis pelo gestor de SST (feedback de
// producao: nao pode ser lista fixa no codigo). Sem exclusao definitiva
// (arquivar via active=false) pra nao invalidar temas que ja usam a
// categoria; dss_themes.category tem FK pra esta tabela.
// ---------------------------------------------------------------------

function slugifyCategory(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);
}

function publicCategory(row) {
	return { id: row.id, label: row.label, active: row.active, sortOrder: row.sort_order };
}

router.get("/categories", requireRotPermission("dss.tema.visualizar"), async (req, res, next) => {
	try {
		const onlyActive = req.query.all !== "true";
		const { rows } = await db.query(
			`select * from dss_categories ${onlyActive ? "where active = true" : ""} order by sort_order, label`,
		);
		res.json({ ok: true, items: rows.map(publicCategory) });
	} catch (error) {
		next(error);
	}
});

router.post("/categories", requireRotPermission("dss.categoria.gerenciar"), async (req, res, next) => {
	try {
		const label = nullableText(req.body?.label, 100);
		if (!label) fail(400, "Nome da categoria é obrigatório.");
		const id = slugifyCategory(req.body?.id) || slugifyCategory(label);
		if (!id) fail(400, "Não foi possível gerar um identificador para a categoria.");
		const { rows: maxRows } = await db.query("select coalesce(max(sort_order), 0) + 10 as next from dss_categories");
		const { rows } = await db.query(
			`insert into dss_categories (id, label, sort_order) values ($1,$2,$3)
			 on conflict (id) do update set label = excluded.label, active = true
			 returning *`,
			[id, label, maxRows[0].next],
		);
		await auditLog(req, { action: "create", entity: "dss_categories", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicCategory(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.patch("/categories/:id", requireRotPermission("dss.categoria.gerenciar"), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query("select * from dss_categories where id = $1", [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Categoria não encontrada.");
		const label = req.body?.label !== undefined ? nullableText(req.body.label, 100) : before.label;
		if (!label) fail(400, "Nome da categoria é obrigatório.");
		const active = req.body?.active !== undefined ? Boolean(req.body.active) : before.active;
		const { rows } = await db.query(
			`update dss_categories set label = $2, active = $3 where id = $1 returning *`,
			[req.params.id, label, active],
		);
		await auditLog(req, { action: "update", entity: "dss_categories", entityId: req.params.id, before, after: rows[0] });
		res.json({ ok: true, item: publicCategory(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/categories/:id/archive", requireRotPermission("dss.categoria.gerenciar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`update dss_categories set active = false where id = $1 returning *`, [req.params.id]);
		if (!rows[0]) fail(404, "Categoria não encontrada.");
		await auditLog(req, { action: "archive", entity: "dss_categories", entityId: req.params.id, after: rows[0] });
		res.json({ ok: true, item: publicCategory(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------

router.get("/themes", requireRotPermission("dss.tema.visualizar"), async (req, res, next) => {
	try {
		const conditions = [];
		const params = [];
		if (req.query.category) { params.push(req.query.category); conditions.push(`t.category = $${params.length}`); }
		if (req.query.modality) { params.push(req.query.modality); conditions.push(`t.modality = $${params.length}`); }
		if (req.query.status) { params.push(req.query.status); conditions.push(`t.status = $${params.length}`); }
		if (req.query.q) { params.push(`%${req.query.q}%`); conditions.push(`t.title ilike $${params.length}`); }
		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
		const { page, pageSize, offset } = parsePagination(req.query);
		const { rows: countRows } = await db.query(`select count(*)::int as n from dss_themes t ${where}`, params);
		const { rows } = await db.query(
			`select t.*, u.name as author_name from dss_themes t
			 left join rot_users u on u.id = t.author_id
			 ${where} order by t.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
			[...params, pageSize, offset],
		);
		res.json({ ok: true, items: rows.map((row) => publicTheme(row)), total: countRows[0].n, page, pageSize });
	} catch (error) {
		next(error);
	}
});

router.get("/themes/:id", requireRotPermission("dss.tema.visualizar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select t.*, u.name as author_name from dss_themes t left join rot_users u on u.id = t.author_id where t.id = $1`,
			[req.params.id],
		);
		const theme = rows[0];
		if (!theme) fail(404, "Tema não encontrado.");
		let weeks = null;
		if (theme.modality === "mensal") {
			const { rows: weekRows } = await db.query(`select * from dss_theme_weeks where theme_id = $1 order by week_number`, [theme.id]);
			weeks = weekRows;
		}
		res.json({ ok: true, item: publicTheme(theme, weeks) });
	} catch (error) {
		next(error);
	}
});

router.post("/themes", requireRotPermission("dss.tema.criar"), async (req, res, next) => {
	try {
		const title = nullableText(req.body?.title, 200);
		if (!title) fail(400, "Título é obrigatório.");
		const category = String(req.body?.category || "");
		if (!(await isActiveCategory(category))) fail(400, "Categoria inválida.");
		const modality = String(req.body?.modality || "");
		if (!MODALITIES.includes(modality)) fail(400, "Modalidade inválida.");
		const contentType = String(req.body?.contentType || "");
		if (!CONTENT_TYPES.includes(contentType)) fail(400, "Tipo de conteúdo inválido.");

		const id = randomId("dsst");
		const { rows } = await db.query(
			`insert into dss_themes (id, title, description, objective, category, notes, modality, content_type, content_blocks, author_id)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
			[
				id,
				title,
				nullableText(req.body?.description, 500),
				nullableText(req.body?.objective, 1000),
				category,
				nullableText(req.body?.notes, 1000),
				modality,
				contentType,
				JSON.stringify(sanitizeContentBlocks(req.body?.contentBlocks)),
				req.rotUser.id,
			],
		);
		await auditLog(req, { action: "create", entity: "dss_themes", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicTheme(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.patch("/themes/:id", requireRotPermission("dss.tema.editar"), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query("select * from dss_themes where id = $1", [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Tema não encontrado.");

		const title = req.body?.title !== undefined ? nullableText(req.body.title, 200) : before.title;
		if (!title) fail(400, "Título é obrigatório.");
		const category = req.body?.category !== undefined ? String(req.body.category) : before.category;
		if (!(await isActiveCategory(category)) && category !== before.category) fail(400, "Categoria inválida.");
		const contentType = req.body?.contentType !== undefined ? String(req.body.contentType) : before.content_type;
		if (!CONTENT_TYPES.includes(contentType)) fail(400, "Tipo de conteúdo inválido.");
		const contentBlocks = req.body?.contentBlocks !== undefined ? sanitizeContentBlocks(req.body.contentBlocks) : before.content_blocks;

		const { rows } = await db.query(
			`update dss_themes set title=$2, description=$3, objective=$4, category=$5, notes=$6, content_type=$7, content_blocks=$8
			 where id=$1 returning *`,
			[
				req.params.id,
				title,
				req.body?.description !== undefined ? nullableText(req.body.description, 500) : before.description,
				req.body?.objective !== undefined ? nullableText(req.body.objective, 1000) : before.objective,
				category,
				req.body?.notes !== undefined ? nullableText(req.body.notes, 1000) : before.notes,
				contentType,
				JSON.stringify(contentBlocks),
			],
		);
		await auditLog(req, { action: "update", entity: "dss_themes", entityId: req.params.id, before, after: rows[0] });
		res.json({ ok: true, item: publicTheme(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/themes/:id/publish", requireRotPermission("dss.tema.editar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`update dss_themes set status='publicado' where id=$1 and status='rascunho' returning *`, [req.params.id]);
		if (!rows[0]) fail(409, "Tema não encontrado ou não está em rascunho.");
		await auditLog(req, { action: "publish", entity: "dss_themes", entityId: req.params.id, after: rows[0] });
		res.json({ ok: true, item: publicTheme(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/themes/:id/archive", requireRotPermission("dss.tema.arquivar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(`update dss_themes set status='arquivado' where id=$1 returning *`, [req.params.id]);
		if (!rows[0]) fail(404, "Tema não encontrado.");
		await auditLog(req, { action: "archive", entity: "dss_themes", entityId: req.params.id, after: rows[0] });
		res.json({ ok: true, item: publicTheme(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// Substitui os 4 desdobramentos semanais de um tema mensal de uma vez.
router.put("/themes/:id/weeks", requireRotPermission("dss.tema.editar"), async (req, res, next) => {
	let client;
	try {
		const { rows: themeRows } = await db.query("select * from dss_themes where id = $1", [req.params.id]);
		const theme = themeRows[0];
		if (!theme) fail(404, "Tema não encontrado.");
		if (theme.modality !== "mensal") fail(400, "Desdobramentos semanais só se aplicam a temas mensais.");
		const weeks = Array.isArray(req.body?.weeks) ? req.body.weeks : [];
		if (weeks.length < 1 || weeks.length > 4) fail(400, "Informe de 1 a 4 semanas.");
		const seenNumbers = new Set();
		for (const week of weeks) {
			const weekNumber = Number(week.weekNumber);
			if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 4) fail(400, "Semana inválida.");
			if (seenNumbers.has(weekNumber)) fail(400, "Semanas duplicadas.");
			seenNumbers.add(weekNumber);
			if (!nullableText(week.title, 200)) fail(400, "Título da semana é obrigatório.");
			if (!CONTENT_TYPES.includes(String(week.contentType))) fail(400, "Tipo de conteúdo da semana inválido.");
		}

		client = await db.connect();
		await client.query("begin");
		await client.query("delete from dss_theme_weeks where theme_id = $1", [req.params.id]);
		const inserted = [];
		for (const week of weeks) {
			const id = randomId("dstw");
			const { rows } = await client.query(
				`insert into dss_theme_weeks (id, theme_id, week_number, title, content_type, content_blocks)
				 values ($1,$2,$3,$4,$5,$6) returning *`,
				[id, req.params.id, Number(week.weekNumber), nullableText(week.title, 200), String(week.contentType), JSON.stringify(sanitizeContentBlocks(week.contentBlocks))],
			);
			inserted.push(rows[0]);
		}
		await client.query("commit");
		await auditLog(req, { action: "update_weeks", entity: "dss_themes", entityId: req.params.id, after: { weeks: inserted.map((row) => row.week_number) } });
		res.json({ ok: true, items: inserted.map(publicThemeWeek) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Programação
// ---------------------------------------------------------------------

router.get("/schedules", requireRotPermission("dss.programacao.visualizar"), async (req, res, next) => {
	try {
		const conditions = [];
		const params = [];
		if (req.query.status) { params.push(req.query.status); conditions.push(`s.status = $${params.length}`); }
		if (req.query.themeId) { params.push(req.query.themeId); conditions.push(`s.theme_id = $${params.length}`); }
		if (req.query.from) { params.push(req.query.from); conditions.push(`s.due_date >= $${params.length}`); }
		if (req.query.to) { params.push(req.query.to); conditions.push(`s.due_date <= $${params.length}`); }
		if (req.query.q) {
			params.push(`%${req.query.q}%`);
			conditions.push(`(s.week_label ilike $${params.length} or coalesce(t.title, tw.title) ilike $${params.length})`);
		}
		const joins = `left join dss_themes t on t.id = s.theme_id left join dss_theme_weeks tw on tw.id = s.theme_week_id`;
		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
		const { page, pageSize, offset } = parsePagination(req.query);
		const { rows: countRows } = await db.query(`select count(*)::int as n from dss_schedules s ${joins} ${where}`, params);
		const { rows } = await db.query(
			`select s.*, coalesce(t.title, tw.title) as theme_title
			 from dss_schedules s ${joins}
			 ${where} order by s.due_date desc limit $${params.length + 1} offset $${params.length + 2}`,
			[...params, pageSize, offset],
		);
		res.json({ ok: true, items: rows.map((row) => publicSchedule(row)), total: countRows[0].n, page, pageSize });
	} catch (error) {
		next(error);
	}
});

router.get("/schedules/:id", requireRotPermission("dss.programacao.visualizar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select s.*, coalesce(t.title, tw.title) as theme_title
			 from dss_schedules s
			 left join dss_themes t on t.id = s.theme_id
			 left join dss_theme_weeks tw on tw.id = s.theme_week_id
			 where s.id = $1`,
			[req.params.id],
		);
		const schedule = rows[0];
		if (!schedule) fail(404, "Programação não encontrada.");
		const { rows: scopeRows } = await db.query(
			`select sc.*, r.nome as regional_name, bc.nome as base_name, ro.name as role_name
			 from dss_schedule_scopes sc
			 left join regionais r on r.id = sc.regional_id
			 left join regional_cidades bc on bc.id = sc.base_id
			 left join rot_roles ro on ro.id = sc.role_id
			 where sc.schedule_id = $1`,
			[req.params.id],
		);
		const { rows: executionRows } = await db.query(
			`select e.*, r.nome as regional_name, bc.nome as base_name, u.name as responsible_name, ${EXECUTION_STATUS_EXPR} as effective_status
			 from dss_executions e
			 left join regionais r on r.id = e.regional_id
			 left join regional_cidades bc on bc.id = e.base_id
			 left join rot_users u on u.id = e.responsible_id
			 where e.schedule_id = $1 order by r.nome, bc.nome`,
			[req.params.id],
		);
		res.json({ ok: true, item: publicSchedule(schedule, scopeRows, executionRows) });
	} catch (error) {
		next(error);
	}
});

router.post("/schedules", requireRotPermission("dss.programacao.gerenciar"), async (req, res, next) => {
	let client;
	try {
		const themeId = req.body?.themeId ? String(req.body.themeId) : null;
		const themeWeekId = req.body?.themeWeekId ? String(req.body.themeWeekId) : null;
		if ((themeId && themeWeekId) || (!themeId && !themeWeekId)) fail(400, "Informe exatamente um de themeId ou themeWeekId.");
		const weekLabel = nullableText(req.body?.weekLabel, 100);
		if (!weekLabel) fail(400, "Rótulo da semana é obrigatório.");
		const startDate = nullableText(req.body?.startDate, 10);
		const endDate = nullableText(req.body?.endDate, 10);
		const dueDate = nullableText(req.body?.dueDate, 10);
		if (!startDate || !endDate || !dueDate) fail(400, "Datas de início, fim e prazo são obrigatórias.");
		const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
		if (!scopes.length) fail(400, "Informe ao menos um público (escopo) para a programação.");
		for (const scope of scopes) {
			if (!OPERATION_TYPES.includes(scope.operationType)) fail(400, "Operação inválida em um dos escopos.");
		}

		if (themeId) {
			const { rows } = await db.query("select id, modality, status from dss_themes where id = $1", [themeId]);
			if (!rows[0]) fail(404, "Tema não encontrado.");
			if (rows[0].modality !== "semanal") fail(400, "Este tema é mensal — programe por semana (themeWeekId).");
		} else {
			const { rows } = await db.query("select id from dss_theme_weeks where id = $1", [themeWeekId]);
			if (!rows[0]) fail(404, "Semana de tema não encontrada.");
		}

		const id = randomId("dssc");
		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`insert into dss_schedules (id, theme_id, theme_week_id, week_label, start_date, end_date, due_date, created_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
			[id, themeId, themeWeekId, weekLabel, startDate, endDate, dueDate, req.rotUser.id],
		);
		for (const scope of scopes) {
			await client.query(
				`insert into dss_schedule_scopes (schedule_id, operation_type, regional_id, base_id, role_id) values ($1,$2,$3,$4,$5)`,
				[id, scope.operationType, scope.regionalId || null, scope.baseId || null, scope.roleId || null],
			);
		}
		await client.query("commit");
		await auditLog(req, { action: "create", entity: "dss_schedules", entityId: id, after: rows[0] });
		res.status(201).json({ ok: true, item: publicSchedule(rows[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.patch("/schedules/:id", requireRotPermission("dss.programacao.gerenciar"), async (req, res, next) => {
	try {
		const { rows: beforeRows } = await db.query("select * from dss_schedules where id = $1", [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Programação não encontrada.");
		if (before.status !== "rascunho") fail(409, "Só é possível editar programações em rascunho.");
		const { rows } = await db.query(
			`update dss_schedules set week_label=$2, start_date=$3, end_date=$4, due_date=$5 where id=$1 returning *`,
			[
				req.params.id,
				req.body?.weekLabel !== undefined ? nullableText(req.body.weekLabel, 100) : before.week_label,
				req.body?.startDate !== undefined ? req.body.startDate : before.start_date,
				req.body?.endDate !== undefined ? req.body.endDate : before.end_date,
				req.body?.dueDate !== undefined ? req.body.dueDate : before.due_date,
			],
		);
		await auditLog(req, { action: "update", entity: "dss_schedules", entityId: req.params.id, before, after: rows[0] });
		res.json({ ok: true, item: publicSchedule(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.post("/schedules/:id/publish", requireRotPermission("dss.programacao.publicar"), async (req, res, next) => {
	let client;
	try {
		client = await db.connect();
		await client.query("begin");
		const { rows: scheduleRows } = await client.query("select * from dss_schedules where id = $1 for update", [req.params.id]);
		const schedule = scheduleRows[0];
		if (!schedule) fail(404, "Programação não encontrada.");
		if (schedule.status !== "rascunho") fail(409, "Programação já foi publicada ou cancelada.");
		const { rows: scopes } = await client.query("select * from dss_schedule_scopes where schedule_id = $1", [req.params.id]);
		if (!scopes.length) fail(409, "Programação sem público definido.");

		const generatedIds = await generateExecutionsForSchedule(client, req, schedule, scopes);

		const { rows: updated } = await client.query(
			`update dss_schedules set status='publicado', published_at=now() where id=$1 returning *`,
			[req.params.id],
		);
		await client.query("commit");
		await auditLog(req, { action: "publish", entity: "dss_schedules", entityId: req.params.id, after: { ...updated[0], executionsGenerated: generatedIds.length } });
		res.json({ ok: true, item: publicSchedule(updated[0]), executionsGenerated: generatedIds.length });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/schedules/:id/cancel", requireRotPermission("dss.programacao.gerenciar"), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`update dss_schedules set status='cancelado' where id=$1 and status <> 'cancelado' returning *`,
			[req.params.id],
		);
		if (!rows[0]) fail(404, "Programação não encontrada.");
		await db.query(
			`update dss_executions set status='cancelado' where schedule_id=$1 and status not in ('enviado','validado','cancelado')`,
			[req.params.id],
		);
		await auditLog(req, { action: "cancel", entity: "dss_schedules", entityId: req.params.id, after: rows[0] });
		res.json({ ok: true, item: publicSchedule(rows[0]) });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Execuções (leitura — presença/evidência/validação chegam na Fase 2)
// ---------------------------------------------------------------------

router.get("/executions", async (req, res, next) => {
	try {
		let clause, params;
		if (req.query.scope === "mine") {
			// "DSS da minha equipe": visao automatica, sem escolha manual,
			// mesmo pra quem tambem tem abrangencia/visao total de SST.
			({ clause, params } = await myTeamClause(req));
		} else {
			if (!userHasRotPermission(req.rotUser, ["dss.execucao.visualizar_abrangencia", "dss.execucao.visualizar_todos"])) {
				fail(403, "Sem permissão para visualizar todas as execuções. Use ?scope=mine para ver as suas.");
			}
			({ clause, params } = await dssVisibilityClause(req));
		}
		const conditions = [clause];
		if (req.query.status) { params.push(req.query.status); conditions.push(`e.status = $${params.length}`); }
		if (req.query.regionalId) { params.push(req.query.regionalId); conditions.push(`e.regional_id = $${params.length}`); }
		if (req.query.themeId) { params.push(req.query.themeId); conditions.push(`e.theme_id = $${params.length}`); }
		// dateFrom/dateTo: usados pelo Calendário do DSS pra carregar so o
		// mês visível em vez de tudo.
		if (req.query.dateFrom) { params.push(req.query.dateFrom); conditions.push(`e.due_date >= $${params.length}`); }
		if (req.query.dateTo) { params.push(req.query.dateTo); conditions.push(`e.due_date <= $${params.length}`); }
		const joins = `left join regionais r on r.id = e.regional_id
			 left join regional_cidades bc on bc.id = e.base_id
			 left join rot_users u on u.id = e.responsible_id
			 left join dss_themes t on t.id = e.theme_id
			 left join dss_theme_weeks tw on tw.id = e.theme_week_id`;
		if (req.query.q) {
			params.push(`%${req.query.q}%`);
			conditions.push(`(e.week_label ilike $${params.length} or coalesce(t.title, tw.title) ilike $${params.length})`);
		}

		// dateFrom/dateTo (modo calendario) pedem tudo no intervalo de uma
		// vez — pageSize alto explicito no client. Sem esse par, e a
		// listagem "Execuções" normal: pagina a partir de 30.
		const { page, pageSize, offset } = parsePagination(req.query);
		const { rows: countRows } = await db.query(`select count(*)::int as n from dss_executions e ${joins} where ${conditions.join(" and ")}`, params);
		const { rows } = await db.query(
			`select e.*, r.nome as regional_name, bc.nome as base_name, u.name as responsible_name,
				coalesce(t.title, tw.title) as theme_title, ${EXECUTION_STATUS_EXPR} as effective_status
			 from dss_executions e ${joins}
			 where ${conditions.join(" and ")}
			 order by e.due_date desc limit $${params.length + 1} offset $${params.length + 2}`,
			[...params, pageSize, offset],
		);
		res.json({ ok: true, items: rows.map((row) => publicExecution(row)), total: countRows[0].n, page, pageSize });
	} catch (error) {
		next(error);
	}
});

// Visibilidade de um registro unico = mesma regra da listagem
// (dssVisibilityClause ja cobre "minha equipe" como fallback pra quem
// nao tem permissao de abrangencia/total — ver helpers.js). So
// reaproveita a clausula, deslocando os indices de parametro em 1
// porque $1 aqui e o id da execucao.
async function canViewExecution(req, executionId) {
	const { clause, params } = await dssVisibilityClause(req, "e");
	const shiftedClause = clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`);
	const { rows } = await db.query(
		`select 1 from dss_executions e where e.id = $1 and (${shiftedClause}) limit 1`,
		[executionId, ...params],
	);
	return rows.length > 0;
}

router.get("/executions/:id", async (req, res, next) => {
	try {
		if (!(await canViewExecution(req, req.params.id))) fail(404, "Execução não encontrada.");
		const { rows } = await db.query(
			`select e.*, r.nome as regional_name, bc.nome as base_name, u.name as responsible_name,
				coalesce(t.title, tw.title) as theme_title, ${EXECUTION_STATUS_EXPR} as effective_status
			 from dss_executions e
			 left join regionais r on r.id = e.regional_id
			 left join regional_cidades bc on bc.id = e.base_id
			 left join rot_users u on u.id = e.responsible_id
			 left join dss_themes t on t.id = e.theme_id
			 left join dss_theme_weeks tw on tw.id = e.theme_week_id
			 where e.id = $1`,
			[req.params.id],
		);
		const execution = rows[0];
		if (!execution) fail(404, "Execução não encontrada.");

		let content = null;
		if (execution.theme_week_id) {
			const { rows: weekRows } = await db.query("select * from dss_theme_weeks where id = $1", [execution.theme_week_id]);
			content = weekRows[0] ? { contentType: weekRows[0].content_type, contentBlocks: weekRows[0].content_blocks } : null;
		} else if (execution.theme_id) {
			const { rows: themeRows } = await db.query("select content_type, content_blocks from dss_themes where id = $1", [execution.theme_id]);
			content = themeRows[0] ? { contentType: themeRows[0].content_type, contentBlocks: themeRows[0].content_blocks } : null;
		}

		const { rows: members } = await db.query(
			`select * from dss_execution_members where execution_id = $1 order by name_snapshot`,
			[req.params.id],
		);
		const { rows: timeline } = await db.query(
			`select * from dss_execution_timeline where execution_id = $1 order by created_at`,
			[req.params.id],
		);
		res.json({ ok: true, item: { ...publicExecution(execution, members, timeline), content } });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------
// Registro de presença, evidência (upload via /admin/attachments com
// entityType=DSS_EXECUTION, já habilitado desde a Fase 1), envio e
// validação — Fase 2.
// ---------------------------------------------------------------------

async function loadExecutionForWrite(req, executionId) {
	const { rows } = await db.query("select * from dss_executions where id = $1", [executionId]);
	const execution = rows[0];
	if (!execution) fail(404, "Execução não encontrada.");
	const isDssStaff = userHasRotPermission(req.rotUser, ["dss.execucao.visualizar_abrangencia", "dss.execucao.visualizar_todos"]);
	const isResponsible = execution.responsible_id === req.rotUser.id;
	if (!isDssStaff && !isResponsible) fail(404, "Execução não encontrada.");
	return execution;
}

function assertEditable(execution) {
	if (!EXECUTION_EDITABLE_STATUSES.includes(execution.status)) {
		fail(409, "Esta execução não pode mais ser editada no status atual.");
	}
}

async function recomputeAttendance(client, executionId) {
	const { rows } = await client.query(
		`select count(*)::int as previstos,
			count(*) filter (where presence_status = 'presente')::int as presentes,
			count(*) filter (where presence_status = 'ausente')::int as ausentes
		 from dss_execution_members where execution_id = $1`,
		[executionId],
	);
	const { previstos, presentes, ausentes } = rows[0];
	const participation = previstos > 0 ? Math.round((presentes / previstos) * 10000) / 100 : null;
	await client.query(
		`update dss_executions set previstos_count=$2, presentes_count=$3, ausentes_count=$4, participation_pct=$5 where id=$1`,
		[executionId, previstos, presentes, ausentes, participation],
	);
	return { previstos, presentes, ausentes, participation };
}

router.patch("/executions/:id/members/:memberId", async (req, res, next) => {
	let client;
	try {
		const execution = await loadExecutionForWrite(req, req.params.id);
		assertEditable(execution);
		const presenceStatus = String(req.body?.presenceStatus || "");
		if (!PRESENCE_STATUSES.includes(presenceStatus)) fail(400, "Status de presença inválido.");
		const absenceReason = req.body?.absenceReason ? String(req.body.absenceReason) : null;
		if (absenceReason && !ABSENCE_REASONS.includes(absenceReason)) fail(400, "Motivo de ausência inválido.");

		client = await db.connect();
		await client.query("begin");
		const { rows } = await client.query(
			`update dss_execution_members
			 set presence_status=$3, absence_reason=$4, absence_note=$5
			 where id=$1 and execution_id=$2 returning *`,
			[req.params.memberId, req.params.id, presenceStatus, presenceStatus === "ausente" ? absenceReason : null, presenceStatus === "ausente" ? nullableText(req.body?.absenceNote, 500) : null],
		);
		if (!rows[0]) fail(404, "Colaborador não encontrado nesta execução.");
		await recomputeAttendance(client, req.params.id);
		if (execution.status === "disponivel" || execution.status === "planejado") {
			await client.query(`update dss_executions set status='em_andamento' where id=$1`, [req.params.id]);
		}
		await client.query("commit");
		await auditLog(req, { action: "update_presence", entity: "dss_executions", entityId: req.params.id, after: { memberId: req.params.memberId, presenceStatus, absenceReason } });
		const { rows: updated } = await db.query(`select * from dss_executions where id = $1`, [req.params.id]);
		res.json({ ok: true, member: publicExecutionMember(rows[0]), execution: publicExecution(updated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/executions/:id/mark-all-present", async (req, res, next) => {
	let client;
	try {
		const execution = await loadExecutionForWrite(req, req.params.id);
		assertEditable(execution);
		client = await db.connect();
		await client.query("begin");
		await client.query(`update dss_execution_members set presence_status='presente', absence_reason=null, absence_note=null where execution_id=$1`, [req.params.id]);
		await recomputeAttendance(client, req.params.id);
		if (execution.status === "disponivel" || execution.status === "planejado") {
			await client.query(`update dss_executions set status='em_andamento' where id=$1`, [req.params.id]);
		}
		await client.query("commit");
		await auditLog(req, { action: "mark_all_present", entity: "dss_executions", entityId: req.params.id });
		const { rows: members } = await db.query(`select * from dss_execution_members where execution_id = $1 order by name_snapshot`, [req.params.id]);
		const { rows: updated } = await db.query(`select * from dss_executions where id = $1`, [req.params.id]);
		res.json({ ok: true, execution: publicExecution(updated[0], members) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/executions/:id/submit", async (req, res, next) => {
	let client;
	try {
		const execution = await loadExecutionForWrite(req, req.params.id);
		assertEditable(execution);
		const { rows: pending } = await db.query(`select count(*)::int as n from dss_execution_members where execution_id=$1 and presence_status='pendente'`, [req.params.id]);
		if (pending[0].n > 0) fail(409, "Marque presença de todos os colaboradores antes de enviar.");
		const { rows: evidence } = await db.query(
			`select count(*)::int as n from rot_image_attachments where entidade_tipo='DSS_EXECUTION' and entidade_id=$1 and status='CONFIRMED' and removido_em is null`,
			[req.params.id],
		);
		if (evidence[0].n < 1) fail(409, "Anexe a evidência (lista de presença assinada) antes de enviar.");

		client = await db.connect();
		await client.query("begin");
		const { previstos, presentes, ausentes, participation } = await recomputeAttendance(client, req.params.id);
		const { rows: updated } = await client.query(
			`update dss_executions set status='enviado', submitted_by=$2, submitted_at=now(), rejection_reason=null where id=$1 returning *`,
			[req.params.id, req.rotUser.id],
		);
		await client.query(
			`insert into dss_execution_timeline (execution_id, event_type, title, description, created_by)
			 values ($1,'submitted','Enviado para validação',$2,$3)`,
			[req.params.id, `Previstos: ${previstos} · Presentes: ${presentes} · Ausentes: ${ausentes} · Participação: ${participation ?? 0}%.`, req.rotUser.id],
		);
		const staff = await findUsersWithPermission(client, "dss.execucao.validar");
		const notifyIds = staff.map((row) => row.id).filter((uid) => uid !== req.rotUser.id);
		if (notifyIds.length) {
			await notifyUsers(client, {
				userIds: notifyIds,
				type: "dss_execution_submitted",
				title: "DSS enviado para validação",
				body: `${updated[0].week_label} · aguardando validação.`,
				entityType: "DSS_EXECUTION",
				entityId: req.params.id,
				deepLink: `/seguranca-trabalho/dss/execucoes/${req.params.id}`,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: "submit", entity: "dss_executions", entityId: req.params.id, after: { previstos, presentes, ausentes, participation } });
		res.json({ ok: true, item: publicExecution(updated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

router.post("/executions/:id/validate", requireRotPermission("dss.execucao.validar"), async (req, res, next) => {
	let client;
	try {
		const { rows: beforeRows } = await db.query("select * from dss_executions where id = $1", [req.params.id]);
		const before = beforeRows[0];
		if (!before) fail(404, "Execução não encontrada.");
		if (before.status !== "enviado") fail(409, "Só é possível validar execuções enviadas.");
		const approved = Boolean(req.body?.approved);
		const note = nullableText(req.body?.note, 1000);
		if (!approved && !note) fail(400, "Informe o motivo da correção solicitada.");

		client = await db.connect();
		await client.query("begin");
		const { rows: updated } = await client.query(
			approved
				? `update dss_executions set status='validado', validated_by=$2, validated_at=now(), validation_note=$3, rejection_reason=null where id=$1 returning *`
				: `update dss_executions set status='rejeitado', validated_by=$2, validated_at=now(), rejection_reason=$3 where id=$1 returning *`,
			[req.params.id, req.rotUser.id, note],
		);
		await client.query(
			`insert into dss_execution_timeline (execution_id, event_type, title, description, created_by)
			 values ($1,$2,$3,$4,$5)`,
			[req.params.id, approved ? "validated" : "rejected", approved ? "DSS validado" : "Correção solicitada", note, req.rotUser.id],
		);
		if (before.responsible_id && before.responsible_id !== req.rotUser.id) {
			await notifyUsers(client, {
				userIds: [before.responsible_id],
				type: approved ? "dss_execution_validated" : "dss_execution_rejected",
				title: approved ? "DSS validado pelo SST" : "SST solicitou correção no DSS",
				body: note || `${before.week_label} · ${approved ? "validado" : "correção solicitada"}.`,
				entityType: "DSS_EXECUTION",
				entityId: req.params.id,
				deepLink: `/seguranca-trabalho/dss/execucoes/${req.params.id}`,
			});
		}
		await client.query("commit");
		await auditLog(req, { action: approved ? "validate" : "reject", entity: "dss_executions", entityId: req.params.id, before: { status: before.status }, after: { status: updated[0].status, note } });
		res.json({ ok: true, item: publicExecution(updated[0]) });
	} catch (error) {
		if (client) await client.query("rollback").catch(() => {});
		next(error);
	} finally {
		client?.release();
	}
});

// ---------------------------------------------------------------------
// Dashboard, indicadores, ranking e relatório detalhado — Fase 3.
// Mesmo padrão de escopo do SST (reportProtocolFilter): visibilidade
// RBAC sempre resolvida no backend via dssVisibilityClause, nunca
// confiando em filtro vindo do frontend.
// ---------------------------------------------------------------------

function parseDssPeriod(query) {
	const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999`) : new Date();
	const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000`) : new Date(to.getFullYear(), to.getMonth(), 1);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) fail(400, "Período inválido.");
	return { from, to };
}

async function dssReportFilter(req, query, alias = "e") {
	const { clause, params } = await dssVisibilityClause(req, alias);
	const conditions = [clause];
	const values = [...params];
	const eq = (col, val) => {
		values.push(val);
		conditions.push(`${alias}.${col} = $${values.length}`);
	};
	if (query.operationType) eq("operation_type", query.operationType);
	if (query.regionalId) eq("regional_id", query.regionalId);
	if (query.baseId) eq("base_id", query.baseId);
	if (query.themeId) eq("theme_id", query.themeId);
	if (query.status) eq("status", query.status);
	if (query.responsibleId) eq("responsible_id", query.responsibleId);
	return { clause: conditions.join(" and "), params: values };
}

router.get("/dashboard/summary", requireRotPermission("dss.dashboard.visualizar"), async (req, res, next) => {
	try {
		const { from, to } = parseDssPeriod(req.query);
		const { clause, params } = await dssReportFilter(req, req.query);
		const values = [...params, from, to];
		const { rows } = await db.query(
			`select
				count(*)::int as programados,
				count(*) filter (where status in ('enviado','validado'))::int as realizados,
				count(*) filter (where status in ('planejado','disponivel','em_andamento'))::int as pendentes,
				count(*) filter (where status in ('planejado','disponivel','em_andamento') and due_date < current_date)::int as atrasados,
				count(*) filter (where status = 'enviado')::int as aguardando_validacao,
				avg(participation_pct) filter (where participation_pct is not null) as participacao_media,
				coalesce(sum(presentes_count), 0)::int as total_presentes,
				coalesce(sum(previstos_count), 0)::int as total_previstos
			 from dss_executions e where ${clause} and e.due_date >= $${values.length - 1} and e.due_date <= $${values.length}`,
			values,
		);
		const row = rows[0];
		res.json({
			ok: true,
			programados: row.programados,
			realizados: row.realizados,
			pendentes: row.pendentes,
			atrasados: row.atrasados,
			awaitingValidation: row.aguardando_validacao,
			participationAvg: row.participacao_media !== null ? Math.round(Number(row.participacao_media) * 10) / 10 : null,
			coverage: row.total_previstos > 0 ? Math.round((row.total_presentes / row.total_previstos) * 1000) / 10 : null,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/dashboard/indicators", requireRotPermission("dss.dashboard.visualizar"), async (req, res, next) => {
	try {
		const { from, to } = parseDssPeriod(req.query);
		const { clause, params } = await dssReportFilter(req, req.query);
		const values = [...params, from, to];
		const dateFilter = `e.due_date >= $${values.length - 1} and e.due_date <= $${values.length}`;

		const [byMonth, byRegional, byOperation, statusDist, absenceReasons] = await Promise.all([
			db.query(
				`select to_char(date_trunc('month', e.due_date), 'YYYY-MM') as bucket,
					avg(e.participation_pct) filter (where e.participation_pct is not null) as avg_participation,
					count(*)::int as total, count(*) filter (where e.status in ('enviado','validado'))::int as realizados
				 from dss_executions e where ${clause} and ${dateFilter} group by 1 order by 1`,
				values,
			),
			db.query(
				`select r.nome as label, avg(e.participation_pct) filter (where e.participation_pct is not null) as avg_participation, count(*)::int as total
				 from dss_executions e left join regionais r on r.id = e.regional_id
				 where ${clause} and ${dateFilter} group by r.nome order by r.nome`,
				values,
			),
			db.query(
				`select e.operation_type as label, avg(e.participation_pct) filter (where e.participation_pct is not null) as avg_participation, count(*)::int as total
				 from dss_executions e where ${clause} and ${dateFilter} group by e.operation_type order by e.operation_type`,
				values,
			),
			db.query(
				`select ${EXECUTION_STATUS_EXPR} as status, count(*)::int as total
				 from dss_executions e where ${clause} and ${dateFilter} group by 1`,
				values,
			),
			db.query(
				`select coalesce(m.absence_reason, 'nao_informado') as reason, count(*)::int as total
				 from dss_execution_members m join dss_executions e on e.id = m.execution_id
				 where ${clause} and ${dateFilter} and m.presence_status = 'ausente' group by 1`,
				values,
			),
		]);

		const mapAvg = (rows) => rows.map((row) => ({
			label: row.label ?? row.bucket,
			bucket: row.bucket,
			total: row.total,
			realizados: row.realizados,
			participationAvg: row.avg_participation !== null ? Math.round(Number(row.avg_participation) * 10) / 10 : null,
		}));

		res.json({
			ok: true,
			participationByMonth: mapAvg(byMonth.rows),
			participationByRegional: mapAvg(byRegional.rows),
			participationByOperation: mapAvg(byOperation.rows),
			statusDistribution: statusDist.rows,
			absenceReasons: absenceReasons.rows,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/dashboard/ranking", requireRotPermission("dss.dashboard.visualizar"), async (req, res, next) => {
	try {
		const { from, to } = parseDssPeriod(req.query);
		const { clause, params } = await dssReportFilter(req, req.query);
		const values = [...params, from, to];
		const { rows } = await db.query(
			`select r.nome as regional_name, bc.nome as base_name, e.operation_type,
				count(*)::int as previstos,
				count(*) filter (where e.status in ('enviado', 'validado'))::int as realizados,
				avg(e.participation_pct) filter (where e.participation_pct is not null) as participacao_media,
				count(*) filter (where e.status in ('enviado', 'validado') and e.submitted_at::date <= e.due_date)::int as no_prazo
			 from dss_executions e
			 left join regionais r on r.id = e.regional_id
			 left join regional_cidades bc on bc.id = e.base_id
			 where ${clause} and e.due_date >= $${values.length - 1} and e.due_date <= $${values.length}
			 group by r.nome, bc.nome, e.operation_type
			 order by participacao_media desc nulls last`,
			values,
		);
		res.json({
			ok: true,
			items: rows.map((row) => ({
				regionalName: row.regional_name,
				baseName: row.base_name,
				operationType: row.operation_type,
				previstos: row.previstos,
				realizados: row.realizados,
				participationAvg: row.participacao_media !== null ? Math.round(Number(row.participacao_media) * 10) / 10 : null,
				onTimePct: row.realizados > 0 ? Math.round((row.no_prazo / row.realizados) * 1000) / 10 : null,
			})),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/reports/details", requireRotPermission("dss.relatorio.visualizar"), async (req, res, next) => {
	try {
		const { clause, params } = await dssReportFilter(req, req.query);
		const conditions = [clause];
		const values = [...params];
		if (req.query.dateFrom) { values.push(req.query.dateFrom); conditions.push(`e.due_date >= $${values.length}`); }
		if (req.query.dateTo) { values.push(req.query.dateTo); conditions.push(`e.due_date <= $${values.length}`); }
		if (req.query.q) {
			values.push(`%${req.query.q}%`);
			conditions.push(`(coalesce(t.title, tw.title) ilike $${values.length} or e.week_label ilike $${values.length})`);
		}
		const page = Math.max(1, Number(req.query.page) || 1);
		const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
		const sortColumns = { dueDate: "e.due_date", status: "e.status", participation: "e.participation_pct", weekLabel: "e.week_label" };
		const sortCol = sortColumns[req.query.sort] || "e.due_date";
		const dir = req.query.dir === "asc" ? "asc" : "desc";
		const joins = `left join regionais r on r.id = e.regional_id
			 left join regional_cidades bc on bc.id = e.base_id
			 left join rot_users u on u.id = e.responsible_id
			 left join dss_themes t on t.id = e.theme_id
			 left join dss_theme_weeks tw on tw.id = e.theme_week_id`;

		const { rows: countRows } = await db.query(`select count(*)::int as n from dss_executions e ${joins} where ${conditions.join(" and ")}`, values);
		const pagedValues = [...values, pageSize, (page - 1) * pageSize];
		const { rows } = await db.query(
			`select e.*, r.nome as regional_name, bc.nome as base_name, u.name as responsible_name,
				coalesce(t.title, tw.title) as theme_title, ${EXECUTION_STATUS_EXPR} as effective_status
			 from dss_executions e ${joins}
			 where ${conditions.join(" and ")}
			 order by ${sortCol} ${dir}
			 limit $${pagedValues.length - 1} offset $${pagedValues.length}`,
			pagedValues,
		);
		res.json({ ok: true, items: rows.map((row) => publicExecution(row)), total: countRows[0].n, page, pageSize });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
