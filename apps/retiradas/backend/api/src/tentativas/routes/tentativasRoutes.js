const express = require("express");
const multer = require("multer");
const service = require("../tentativasService");
const central = require("../tentativasCentralService");
const alerts = require("../tentativasAlertsService");

const evidenceUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: Number(process.env.TENTATIVAS_EVIDENCE_LIMIT_BYTES || 8 * 1024 * 1024) },
	fileFilter: (_req, file, callback) => {
		const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
		if (!allowed.has(String(file?.mimetype || "").toLowerCase())) {
			callback(new Error("Envie uma evidencia em PDF, JPG, PNG ou WEBP."));
			return;
		}
		callback(null, true);
	},
});

function isValidEvidenceBuffer(file) {
	if (!file?.buffer?.length) return false;
	const buffer = file.buffer;
	const pdf = buffer.subarray(0, 5).toString("utf8") === "%PDF-";
	const png = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
	const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
	return pdf || png || jpeg || webp;
}

function uploadEvidence(req, res, next) {
	evidenceUpload.single("file")(req, res, (error) => {
		if (error) {
			const statusCode = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
			res.status(statusCode).json({ error: statusCode === 413 ? "Evidencia maior que 8 MB." : error.message });
			return;
		}
		if (!isValidEvidenceBuffer(req.file)) {
			res.status(400).json({ error: "Arquivo de evidencia invalido ou corrompido." });
			return;
		}
		next();
	});
}

function createTentativasRouter({
	requireAnyPermission,
	requireAuthenticated,
	requireCsrfToken,
	fallbackRoles = ["admin"],
} = {}) {
	const router = express.Router();
	const requireView = requireAnyPermission(service.VIEW_PERMISSIONS, fallbackRoles);
	const requireContact = requireAnyPermission(service.CONTACT_PERMISSIONS, fallbackRoles);
	const requireRegister = requireAnyPermission(service.REGISTER_PERMISSIONS, fallbackRoles);
	const requireSchedule = requireAnyPermission(service.SCHEDULE_PERMISSIONS, fallbackRoles);
	const requirePortfolio = requireAnyPermission(service.PORTFOLIO_PERMISSIONS, fallbackRoles);
	const requireManagement = requireAnyPermission(service.MANAGEMENT_PERMISSIONS, fallbackRoles);
	const requireAudit = requireAnyPermission(service.AUDIT_PERMISSIONS, fallbackRoles);
	const requireHistory = requireAnyPermission(
		service.HISTORY_PERMISSIONS,
		fallbackRoles,
	);
	const requireDistribution = requireAnyPermission(
		service.DISTRIBUTE_PERMISSIONS,
		fallbackRoles,
	);
	const requireCampaign = requireAnyPermission(
		service.CAMPAIGN_PERMISSIONS,
		fallbackRoles,
	);
	const requireTemplate = requireAnyPermission(
		service.TEMPLATE_PERMISSIONS,
		fallbackRoles,
	);
	const requireSettings = requireAnyPermission(
		service.SETTINGS_PERMISSIONS,
		fallbackRoles,
	);
	const requireExport = requireAnyPermission(
		service.EXPORT_PERMISSIONS,
		fallbackRoles,
	);

	router.get("/cidades", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.listCities(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/minha-rota", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.getMyRoute(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/localidades", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await service.listNeighborhoods(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/retornos", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await central.listCallbacks(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.put(
		"/retornos/:id",
		requireAuthenticated,
		requireCsrfToken,
		requireSchedule,
		async (req, res, next) => {
			try {
				res.json(await central.updateCallback(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/retornos",
		requireAuthenticated,
		requireCsrfToken,
		requireSchedule,
		async (req, res, next) => {
			try {
				res.status(201).json(await central.createCallback(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/recuperacoes", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await central.listRecoveries(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/produtividade", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			res.json(await central.getMyProductivity(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/acessos", requireAuthenticated, requireCsrfToken, requireView, async (req, res, next) => {
		try {
			res.status(201).json(await alerts.recordPageVisit(req.user || {}, {
				sessionId: req.body?.sessionId,
				source: req.body?.source || "PWA",
				userAgent: req.get("user-agent"),
				metadata: { tab: req.body?.tab || "route" },
			}));
		} catch (error) { next(error); }
	});

	router.put(
		"/recuperacoes/:id/status",
		requireAuthenticated,
		requireCsrfToken,
		requireRegister,
		async (req, res, next) => {
			try {
				res.json(await central.updateRecovery(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/recuperacoes/:id/evidencias",
		requireAuthenticated,
		requireCsrfToken,
		requireRegister,
		uploadEvidence,
		async (req, res, next) => {
			try {
				res.status(201).json(await central.saveRecoveryEvidence(req.params.id, req.file, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/historico", requireAuthenticated, requireHistory, async (req, res, next) => {
		try {
			res.json(await service.listHistory(req.query || {}, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/historico/export.csv",
		requireAuthenticated,
		requireExport,
		async (req, res, next) => {
			try {
				const csv = await service.exportCsv(req.query || {}, req.user || {});
				res.setHeader("Content-Type", "text/csv; charset=utf-8");
				res.setHeader(
					"Content-Disposition",
					'attachment; filename="tentativas.csv"',
				);
				res.send(csv);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/contacts/:id/resultado",
		requireAuthenticated,
		requireCsrfToken,
		requireRegister,
		async (req, res, next) => {
			try {
				res.json(await service.saveResult(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/contacts/:id/corrigir",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(service.CORRECTION_PERMISSIONS, fallbackRoles),
		async (req, res, next) => {
			try {
				res.json(await central.correctContact(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/resumo",
		requireAuthenticated,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.getOverview(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/analytics",
		requireAuthenticated,
		requireManagement,
		async (req, res, next) => {
			try {
				res.json(await central.getAnalytics(req.query || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/analytics/export.csv",
		requireAuthenticated,
		requireExport,
		async (req, res, next) => {
			try {
				const csv = await central.exportAnalyticsCsv(req.query || {}, req.user || {});
				res.setHeader("Content-Type", "text/csv; charset=utf-8");
				res.setHeader("Content-Disposition", 'attachment; filename="tentativas-gestao.csv"');
				res.send(csv);
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/inteligencia",
		requireAuthenticated,
		requireManagement,
		async (req, res, next) => {
			try {
				res.json(await central.getIntelligence(req.query || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/novos-contatos",
		requireAuthenticated,
		requireManagement,
		async (req, res, next) => {
			try {
				res.json(await central.listNewContacts(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/adocao",
		requireAuthenticated,
		requireManagement,
		async (req, res, next) => {
			try { res.json(await alerts.listUsageMetrics(req.query || {})); } catch (error) { next(error); }
		},
	);

	router.get(
		"/admin/alertas",
		requireAuthenticated,
		requireManagement,
		async (req, res, next) => {
			try { res.json(await alerts.listAlertHistory(req.query || {})); } catch (error) { next(error); }
		},
	);

	router.post(
		"/admin/alertas/executar",
		requireAuthenticated,
		requireCsrfToken,
		requireManagement,
		async (_req, res, next) => {
			try { res.json(await alerts.publishHourlyTechnicianAlerts()); } catch (error) { next(error); }
		},
	);

	router.get(
		"/admin/auditoria",
		requireAuthenticated,
		requireAudit,
		async (req, res, next) => {
			try {
				res.json(await central.listAudit(req.query || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/recalcular-prioridades",
		requireAuthenticated,
		requireCsrfToken,
		requireManagement,
		async (req, res, next) => {
			try {
				res.json(await central.refreshPriorityScores(req.body || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/atribuicoes/:id/transferir",
		requireAuthenticated,
		requireCsrfToken,
		requirePortfolio,
		async (req, res, next) => {
			try {
				res.json(await central.transferAssignment(req.params.id, req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/ranking",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.getRanking());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/distribuicao",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.listDistribution());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/cidades-tecnicos",
		requireAuthenticated,
		requireDistribution,
		async (_req, res, next) => {
			try {
				res.json(await service.listTechnicianCities());
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/bairros",
		requireAuthenticated,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.listNeighborhoodAssignments(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/bairros/transferir",
		requireAuthenticated,
		requireCsrfToken,
		requirePortfolio,
		async (req, res, next) => {
			try {
				res.json(await service.transferNeighborhood(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/usuarios",
		requireAuthenticated,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.searchUsers(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/cidades-tecnicos",
		requireAuthenticated,
		requireCsrfToken,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.saveTechnicianCity(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/admin/cidades-tecnicos/:id",
		requireAuthenticated,
		requireCsrfToken,
		requireDistribution,
		async (req, res, next) => {
			try {
				res.json(await service.removeTechnicianCity(req.params.id, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/campanhas",
		requireAuthenticated,
		requireCsrfToken,
		requireCampaign,
		async (req, res, next) => {
			try {
				res.json(await service.createCampaign(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/templates",
		requireAuthenticated,
		requireTemplate,
		async (_req, res, next) => {
			try {
				res.json(await service.listTemplates());
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/admin/templates",
		requireAuthenticated,
		requireCsrfToken,
		requireTemplate,
		async (req, res, next) => {
			try {
				res.json(await service.saveTemplate(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/admin/configuracoes",
		requireAuthenticated,
		requireSettings,
		async (_req, res, next) => {
			try {
				res.json(await service.getSettings());
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/admin/configuracoes",
		requireAuthenticated,
		requireCsrfToken,
		requireSettings,
		async (req, res, next) => {
			try {
				res.json(await service.saveSettings(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/:id/timeline", requireAuthenticated, requireHistory, async (req, res, next) => {
		try {
			res.json(await central.listTimeline(req.params.id, req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/:id", requireAuthenticated, requireView, async (req, res, next) => {
		try {
			const item = await service.getOpportunity(req.params.id, req.user || {});
			if (!item) {
				res.status(404).json({ error: "Oportunidade nao encontrada." });
				return;
			}
			res.json(item);
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/:id/iniciar",
		requireAuthenticated,
		requireCsrfToken,
		requireContact,
		async (req, res, next) => {
			try {
				res.json(await service.startContact(req.params.id, req.body || {}, req.user || {}, req));
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createTentativasRouter;
