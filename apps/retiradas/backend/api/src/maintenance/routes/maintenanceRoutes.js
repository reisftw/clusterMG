const express = require("express");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");

function createMaintenanceRouter({
	maintenanceService,
	mobileAppDistributionService,
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
	publicEventLimiter,
}) {
	const router = express.Router();
	const requireAdmin = [requireAuthenticated, requireRoles(["admin"])];
	fs.mkdirSync(mobileAppDistributionService.temporaryRoot, { recursive: true });
	const appUpload = multer({
		storage: multer.diskStorage({
			destination: (_req, _file, callback) => callback(null, mobileAppDistributionService.temporaryRoot),
			filename: (_req, _file, callback) => callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}.apk`),
		}),
		limits: { files: 1, fileSize: mobileAppDistributionService.MAX_APK_BYTES },
		fileFilter: (_req, file, callback) => {
			if (!/\.apk$/i.test(String(file?.originalname || ""))) {
				callback(new Error("Envie um arquivo com extensao .apk."));
				return;
			}
			callback(null, true);
		},
	});

	function uploadApk(req, res, next) {
		appUpload.single("apk")(req, res, (error) => {
			if (!error) return next();
			const statusCode = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
			res.status(statusCode).json({
				error: statusCode === 413 ? "O APK excede o limite permitido." : error.message || "Falha no envio do APK.",
			});
		});
	}

	router.get("/status", async (_req, res, next) => {
		try {
			res.set("Cache-Control", "no-store");
			res.json(await maintenanceService.getPublicStatus());
		} catch (error) {
			next(error);
		}
	});

	router.post("/service-worker/events", publicEventLimiter, async (req, res, next) => {
		try {
			res.json(
				await maintenanceService.recordServiceWorkerEvent(
					req.body || {},
					req.get("user-agent") || "",
				),
			);
		} catch (error) {
			next(error);
		}
	});

	router.get("/dashboard", ...requireAdmin, async (req, res, next) => {
		try {
			res.json(await maintenanceService.getDashboard(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/app", ...requireAdmin, async (_req, res, next) => {
		try {
			res.json(await mobileAppDistributionService.getDashboard());
		} catch (error) {
			next(error);
		}
	});

	router.get("/app/version", async (req, res, next) => {
		try {
			res.set("Cache-Control", "no-store");
			res.json(await mobileAppDistributionService.getPublicVersion(req.query?.currentCode));
		} catch (error) {
			next(error);
		}
	});

	router.patch(
		"/app/releases/:releaseId/notes",
		...requireAdmin,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const release = await mobileAppDistributionService.updateReleaseNotes(
					req.params.releaseId,
					req.body?.notes,
				);
				res.json({ ok: true, release });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post("/app/enrollment", requireAuthenticated, requireCsrfToken, async (req, res, next) => {
		try {
			res.status(201).json(await mobileAppDistributionService.createEnrollment(req.user || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/app/enrollment/exchange", async (req, res, next) => {
		try {
			res.json(await mobileAppDistributionService.exchangeEnrollment(req.body || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post("/app/location", async (req, res, next) => {
		try {
			const authorization = String(req.get("authorization") || "");
			const deviceToken = authorization.replace(/^Device\s+/i, "").trim();
			res.json(await mobileAppDistributionService.saveNativeLocation(deviceToken, req.body || {}));
		} catch (error) {
			next(error);
		}
	});

	router.get("/app/download", async (req, res, next) => {
		try {
			const release = await mobileAppDistributionService.getActiveReleaseRow();
			if (!release) {
				res.status(404).json({ error: "Ainda nao existe um APK publicado." });
				return;
			}
			if (req.method !== "HEAD") {
				await mobileAppDistributionService.recordDownload(release.id);
			}
			res.set("Cache-Control", "no-store");
			res.set("Content-Type", "application/vnd.android.package-archive");
			res.download(
				path.resolve(release.storage_path),
				`REVO-${release.version_name}.apk`,
				(error) => {
					if (error && !res.headersSent) next(error);
				},
			);
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/app/upload",
		...requireAdmin,
		requireCsrfToken,
		uploadApk,
		async (req, res, next) => {
			try {
				if (!req.file?.path) {
					res.status(400).json({ error: "Selecione um arquivo APK." });
					return;
				}
				const release = await mobileAppDistributionService.publishApk({
					filePath: req.file.path,
					originalName: req.file.originalname,
					versionName: req.body?.versionName,
					versionCode: req.body?.versionCode,
					notes: req.body?.notes,
					user: req.user || {},
				});
				res.status(201).json({ ok: true, release });
			} catch (error) {
				if (req.file?.path) await fsp.unlink(req.file.path).catch(() => {});
				next(error);
			}
		},
	);

	router.get("/history", ...requireAdmin, async (req, res, next) => {
		try {
			res.json(await maintenanceService.listHistory(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/activate",
		...requireAdmin,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				res.json(
					await maintenanceService.activateMaintenance(req.body || {}, req.user || {}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/deactivate",
		...requireAdmin,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				res.json(
					await maintenanceService.deactivateMaintenance(req.user || {}, "MANUAL"),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

module.exports = createMaintenanceRouter;
