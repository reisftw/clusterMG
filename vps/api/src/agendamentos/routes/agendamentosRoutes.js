const express = require("express");
const agendamentosRepository = require("../../agendamentosRepository");

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

	router.post("/", requireCsrfToken, requireManage, async (req, res, next) => {
		try {
			const item = await agendamentosRepository.createAppointment(req.body || {});
			res.json({ ok: true, id: item?.id, item });
		} catch (error) {
			next(error);
		}
	});

	router.put("/:id", requireCsrfToken, requireManage, async (req, res, next) => {
		try {
			const item = await agendamentosRepository.updateAppointment(
				req.params.id,
				req.body || {},
			);
			res.json({ ok: true, id: item?.id || req.params.id, item });
		} catch (error) {
			next(error);
		}
	});

	router.delete("/:id", requireCsrfToken, requireManage, async (req, res, next) => {
		try {
			const deleted = await agendamentosRepository.deleteAppointment(req.params.id);
			res.json({ ok: true, deleted });
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = createAgendamentosRouter;
