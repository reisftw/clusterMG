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
				const payload = scopeWritePayload(req.user, req.validated.body);
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
				const payload = scopeWritePayload(req.user, req.validated.body);
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
