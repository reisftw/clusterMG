const express = require("express");
const agendamentosRepository = require("../../agendamentosRepository");
const auditLog = require("../../auditLog");
const {
	assertRegionalRecordAccess,
	scopeWritePayload,
} = require("../../security/regionalScope");
const { validate } = require("../../dtos/middleware");
const { AgendamentoWriteDTO, IdParamDTO } = require("../../dtos/agendamentoDto");

const PAGE_SIZE = 1000;
const CLIENT_ACTOR_FIELDS = [
	"atendente_id",
	"atendente_nome",
	"agendado_por_id",
	"agendado_por_nome",
	"criado_por_id",
	"criado_por_nome",
	"atualizado_por_id",
	"atualizado_por_nome",
];

function toPositiveInt(value, fallback) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(Math.trunc(parsed), 1);
}

async function listAll(fetchPage, { max = 10000 } = {}) {
	const items = [];
	let offset = 0;
	while (items.length < max) {
		const page = await fetchPage({
			limit: Math.min(PAGE_SIZE, max - items.length),
			offset,
		});
		items.push(...page);
		if (page.length < PAGE_SIZE) break;
		offset += page.length;
	}
	return items;
}

function getActorId(user = {}) {
	return String(user.uid || user.id || user.userId || user.email || "").trim();
}

function getActorName(user = {}) {
	return String(
		user.displayName ||
			user.display_name ||
			user.nome ||
			user.profile?.displayName ||
			user.profile?.display_name ||
			user.profile?.nome ||
			user.email ||
			user.uid ||
			"Usuario",
	).trim();
}

function stripClientActorFields(data = {}) {
	const payload = { ...data };
	for (const field of CLIENT_ACTOR_FIELDS) delete payload[field];
	return payload;
}

function withCreateActor(data = {}, user) {
	const actorId = getActorId(user);
	const actorName = getActorName(user);
	return {
		...data,
		atendente_id: actorId,
		atendente_nome: actorName,
		agendado_por_id: actorId,
		agendado_por_nome: actorName,
		criado_por_id: actorId,
		criado_por_nome: actorName,
	};
}

function withUpdateActor(data = {}, user) {
	return {
		...data,
		atualizado_por_id: getActorId(user),
		atualizado_por_nome: getActorName(user),
	};
}

function createAgendamentosRouter({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
}) {
	const router = express.Router();
	const requireView = requireAnyPermission([
		"cliente.agendamentos.view",
		"cliente.agendamentos.manage",
		"view_agendamentos",
		"manage_agendamentos",
	]);
	const requireManage = requireAnyPermission([
		"cliente.agendamentos.manage",
		"manage_agendamentos",
	]);

	router.use(requireAuthenticated);

	router.get("/", requireView, async (req, res, next) => {
		try {
			const max = toPositiveInt(req.query.max, 10000);
			const items = await listAll(
				(options) =>
					agendamentosRepository.listAppointments({
						...options,
						startDate: req.query.startDate,
						endDate: req.query.endDate,
					}),
				{ max },
			);
			res.json({ items });
		} catch (error) {
			next(error);
		}
	});

	router.get("/logs", requireView, async (req, res, next) => {
		try {
			const max = toPositiveInt(req.query.max, 3000);
			const items = await listAll(
				(options) => agendamentosRepository.listAppointmentLogs(options),
				{ max },
			);
			res.json({ items });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/",
		requireCsrfToken,
		requireManage,
		validate({ body: AgendamentoWriteDTO }),
		async (req, res, next) => {
			try {
				// Defesa contra IDOR/escalada de escopo (docs/TECHNICAL-AUDIT.md,
				// achado #3): um supervisor so pode criar agendamento pra propria
				// regional — o campo `regional` do body nunca e confiavel por si so.
				const scopedPayload = scopeWritePayload(
					req.user,
					stripClientActorFields(req.validated.body),
				);
				const payload = withCreateActor(scopedPayload, req.user);
				const item = await agendamentosRepository.createAppointment(payload);
				// Auditoria (docs/TECHNICAL-AUDIT.md, achado #5): agendamento nao
				// passava pela camada generica de "documents" que audita sozinha,
				// entao criar/editar/excluir aqui nao deixava rastro nenhum.
				auditLog.recordAuditLog({
					action: "create",
					module: "agendamentos",
					entity: "agendamentos",
					recordId: item?.id,
					beforeData: null,
					afterData: item,
					changedFields: auditLog.calculateChangedFields(null, item),
				});
				res.json({ ok: true, id: item?.id, item });
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/:id",
		requireCsrfToken,
		requireManage,
		validate({ params: IdParamDTO, body: AgendamentoWriteDTO }),
		async (req, res, next) => {
			try {
				const { id } = req.validated.params;
				const current = await agendamentosRepository.getAppointment(id);
				if (!current) {
					res.status(404).json({ error: "Agendamento não encontrado." });
					return;
				}
				// Mesma checagem de posse do modulo de documentos
				// (documentosService.js#requireEmpresaAccess), adaptada ao escopo
				// regional deste dominio: permissao de "manage_agendamentos" sozinha
				// nao basta pra alterar um agendamento de outra regional.
				assertRegionalRecordAccess(req.user, current);
				const scopedPayload = scopeWritePayload(
					req.user,
					stripClientActorFields(req.validated.body),
				);
				const payload = withUpdateActor(scopedPayload, req.user);
				const item = await agendamentosRepository.updateAppointment(id, payload);
				const changedFields = auditLog.calculateChangedFields(current, item);
				if (changedFields.length) {
					auditLog.recordAuditLog({
						action: "update",
						module: "agendamentos",
						entity: "agendamentos",
						recordId: id,
						beforeData: current,
						afterData: item,
						changedFields,
					});
				}
				res.json({ ok: true, id: item?.id || id, item });
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:id",
		requireCsrfToken,
		requireManage,
		validate({ params: IdParamDTO }),
		async (req, res, next) => {
			try {
				const { id } = req.validated.params;
				const current = await agendamentosRepository.getAppointment(id);
				if (!current) {
					res.status(404).json({ error: "Agendamento não encontrado." });
					return;
				}
				assertRegionalRecordAccess(req.user, current);
				const deleted = await agendamentosRepository.deleteAppointment(id);
				auditLog.recordAuditLog({
					action: "delete",
					module: "agendamentos",
					entity: "agendamentos",
					recordId: id,
					beforeData: current,
					afterData: null,
					changedFields: Object.keys(current || {}),
				});
				res.json({ ok: true, deleted });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createAgendamentosRouter;
