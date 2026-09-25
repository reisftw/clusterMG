const express = require("express");
const agendamentosRepository = require("../../agendamentosRepository");
const mensageriaRepository = require("../../mensageriaRepository");
const PAGE_SIZE = 1000;

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

function getTimestampValue(value) {
	if (!value) return 0;
	if (typeof value === "object") {
		if (typeof value.toDate === "function") {
			const date = value.toDate();
			return Number.isNaN(date?.getTime?.()) ? 0 : date.getTime();
		}
		if (value.value) return getTimestampValue(value.value);
		if (value.seconds) return Number(value.seconds) * 1000;
	}
	const parsed = new Date(value).getTime();
	return Number.isNaN(parsed) ? 0 : parsed;
}

function getCallbackTimestamp(item = {}) {
	return Math.max(
		getTimestampValue(item.criado_em),
		getTimestampValue(item.criadoEm),
		getTimestampValue(item.recebido_em),
		getTimestampValue(item.recebidoEm),
		getTimestampValue(item.updatedAt),
		getTimestampValue(item.atualizado_em),
	);
}

function sortCallbacksByDateDesc(items = []) {
	return [...items].sort((left, right) => {
		const diff = getCallbackTimestamp(right) - getCallbackTimestamp(left);
		if (diff) return diff;
		return String(right.id || "").localeCompare(String(left.id || ""));
	});
}

function toNumber(value, fallback) {
	const parsed = Number(value || fallback);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(Math.trunc(parsed), 0);
}

function createMensageriaRouter({
	adminRoles,
	evolutionMessaging,
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
}) {
	const router = express.Router();
	const requireConfigView = requireAnyPermission(
		["mensageria.email_config.view", "mensageria.email_config.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireConfigManage = requireAnyPermission(
		["mensageria.email_config.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireFilaView = requireAnyPermission(
		["mensageria.fila.view", "mensageria.fila.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireFilaManage = requireAnyPermission(
		["mensageria.fila.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireHistoricoView = requireAnyPermission(
		[
			"mensageria.enviados.view",
			"mensageria.relatorios.view",
			"view_mensageria",
			"view_mensageria_relatorios",
			"manage_mensageria",
		],
		adminRoles,
	);
	const requireCallbackView = requireAnyPermission(
		["mensageria.callback.view", "mensageria.callback.manage", "manage_mensageria"],
		adminRoles,
	);
	const requireCallbackManage = requireAnyPermission(
		["mensageria.callback.manage", "manage_mensageria"],
		adminRoles,
	);

	router.use(requireAuthenticated);

	router.get("/config", requireConfigView, async (_req, res, next) => {
		try {
			res.json(await mensageriaRepository.getMessagingConfig());
		} catch (error) {
			next(error);
		}
	});

	router.put("/config", requireCsrfToken, requireConfigManage, async (req, res, next) => {
		try {
			res.json(await mensageriaRepository.saveMessagingConfigPatch(req.body || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/templates", requireConfigView, async (req, res, next) => {
		try {
			res.json({
				items: await mensageriaRepository.listMessageTemplates({
					limit: req.query.limit,
					offset: req.query.offset,
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	router.put(
		"/templates/:id",
		requireCsrfToken,
		requireConfigManage,
		async (req, res, next) => {
			try {
				const item = await mensageriaRepository.saveMessageTemplate({
					...(req.body || {}),
					id: req.params.id,
				});
				res.json({ ok: true, item, id: item.id });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/fila", requireFilaView, async (req, res, next) => {
		try {
			res.json({
				items: await mensageriaRepository.listQueueMessages({
					limit: req.query.limit,
					offset: req.query.offset,
					status: req.query.status,
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/fila", requireCsrfToken, requireFilaManage, async (req, res, next) => {
		try {
			const item = await mensageriaRepository.enqueueMessage(req.body || {});
			res.json({ ok: true, item, id: item.id });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/fila/ajustar",
		requireCsrfToken,
		requireFilaManage,
		async (_req, res, next) => {
			try {
				if (!evolutionMessaging?.adjustQueueAgainstOpenOrders) {
					res.status(503).json({ error: "Ajuste de fila indisponível." });
					return;
				}
				res.json(await evolutionMessaging.adjustQueueAgainstOpenOrders());
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/fila/:id",
		requireCsrfToken,
		requireFilaManage,
		async (req, res, next) => {
			try {
				const item = await mensageriaRepository.updateQueueMessage(
					req.params.id,
					req.body || {},
				);
				res.json({ ok: true, item });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/historico", requireHistoricoView, async (req, res, next) => {
		try {
			res.json({
				items: await mensageriaRepository.listHistoryEntries({
					limit: req.query.limit,
					offset: req.query.offset,
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/historico",
		requireCsrfToken,
		requireFilaManage,
		async (req, res, next) => {
			try {
				const item = await mensageriaRepository.createHistoryEntry(req.body || {});
				res.json({ ok: true, item, id: item.id });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/callbacks", requireCallbackView, async (req, res, next) => {
		try {
			const limit = toNumber(req.query.limit, 250) || 250;
			const offset = toNumber(req.query.offset, 0);
			res.json({
				items: sortCallbacksByDateDesc(
					await mensageriaRepository.listCallbacks({ limit, offset }),
				),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/callbacks",
		requireCsrfToken,
		requireCallbackManage,
		async (req, res, next) => {
			try {
				const item = await mensageriaRepository.recordCallback(req.body || {});
				res.json({ ok: true, item, id: item.id });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/callbacks/gerar-agendamento",
		requireCsrfToken,
		requireCallbackManage,
		async (req, res, next) => {
			try {
				if (!evolutionMessaging?.generateAppointmentFromStoredResponses) {
					res.status(503).json({ error: "Geração de agendamento indisponível." });
					return;
				}
				res.json(
					await evolutionMessaging.generateAppointmentFromStoredResponses(
						req.body || {},
					),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/enviados", requireHistoricoView, async (_req, res, next) => {
		try {
			const [historico, callbacks] = await Promise.all([
				listAll((options) => mensageriaRepository.listHistoryEntries(options)),
				listAll((options) => mensageriaRepository.listCallbacks(options)),
			]);
			const historicoOrdenado = [...historico].sort((left, right) =>
				String(right.criadoEm || "").localeCompare(String(left.criadoEm || "")),
			);
			const enviados = historico.filter(
				(item) => String(item.status || "") === "enviado",
			);
			res.json({
				items: historicoOrdenado,
				hasNext: false,
				resumo: {
					enviados: enviados.length,
					falhas: historico.filter(
						(item) => String(item.status || "") === "falhou",
					).length,
					respostas: callbacks.length,
				},
				callbacks: sortCallbacksByDateDesc(callbacks),
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/relatorios/dados", requireHistoricoView, async (_req, res, next) => {
		try {
			const [historico, callbacks, fila, agendamentoDocuments] = await Promise.all([
				listAll((options) => mensageriaRepository.listHistoryEntries(options)),
				listAll((options) => mensageriaRepository.listCallbacks(options)),
				listAll((options) => mensageriaRepository.listQueueMessages(options)),
				listAll(
					(options) =>
						agendamentosRepository.listAppointmentDocuments(options),
					{ max: 2000 },
				),
			]);
			res.json({
				historico,
				callbacks,
				fila,
				agendamentos: agendamentoDocuments.map((item) => ({
					id: item.documentId,
					...(item.data || {}),
				})),
			});
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = createMensageriaRouter;
