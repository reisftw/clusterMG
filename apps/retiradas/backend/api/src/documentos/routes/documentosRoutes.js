const express = require("express");
const multer = require("multer");
const controller = require("../controllers/documentosController");

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, maximum);
}

const UPLOAD_FILE_LIMIT_BYTES = positiveInteger(
	process.env.DOCUMENTOS_UPLOAD_LIMIT_BYTES,
	25 * 1024 * 1024,
);
const UPLOAD_MAX_FILES = positiveInteger(
	process.env.DOCUMENTOS_UPLOAD_MAX_FILES,
	30,
	30,
);
const UPLOAD_TOTAL_LIMIT_BYTES = positiveInteger(
	process.env.DOCUMENTOS_UPLOAD_TOTAL_LIMIT_BYTES,
	80 * 1024 * 1024,
);
const REQUEST_UPLOAD_BYTES = Symbol("documentosUploadBytes");

function createBoundedMemoryStorage(totalLimitBytes = UPLOAD_TOTAL_LIMIT_BYTES) {
	return {
		_handleFile(req, file, callback) {
			let chunks = [];
			let size = 0;
			let finished = false;
			const finish = (error, result) => {
				if (finished) return;
				finished = true;
				callback(error, result);
			};

			file.stream.on("data", (chunk) => {
				if (finished) return;
				req[REQUEST_UPLOAD_BYTES] =
					Number(req[REQUEST_UPLOAD_BYTES] || 0) + chunk.length;
				if (req[REQUEST_UPLOAD_BYTES] > totalLimitBytes) {
					chunks = [];
					const error = new multer.MulterError(
						"LIMIT_FILE_SIZE",
						file.fieldname,
					);
					error.code = "LIMIT_TOTAL_FILE_SIZE";
					error.message = "Conjunto de arquivos maior que o limite permitido.";
					finish(error);
					return;
				}
				size += chunk.length;
				chunks.push(chunk);
			});
			file.stream.on("error", (error) => finish(error));
			file.stream.on("end", () => {
				if (finished) return;
				finish(null, { buffer: Buffer.concat(chunks, size), size });
			});
		},
		_removeFile(_req, file, callback) {
			delete file.buffer;
			callback(null);
		},
	};
}

const upload = multer({
	storage: createBoundedMemoryStorage(),
	limits: {
		fileSize: UPLOAD_FILE_LIMIT_BYTES,
		files: UPLOAD_MAX_FILES,
	},
	fileFilter: (_req, file, cb) => {
		const name = String(file?.originalname || "").toLowerCase();
		const mime = String(file?.mimetype || "").toLowerCase();
		const allowed =
			(mime === "application/pdf" && name.endsWith(".pdf")) ||
			(["image/png", "image/jpeg"].includes(mime) &&
				/\.(png|jpe?g)$/.test(name));
		if (!allowed) {
			cb(new Error("Apenas arquivos PDF, PNG ou JPG sao aceitos."));
			return;
		}
		cb(null, true);
	},
});

function isAllowedDocumentBuffer(file) {
	if (!file?.buffer?.length) return false;
	const header5 = file.buffer.subarray(0, 5).toString("utf8");
	const header4 = file.buffer.subarray(0, 4);
	const header3 = file.buffer.subarray(0, 3);
	const isPdf = header5 === "%PDF-";
	const isPng = header4.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const isJpeg = header3.equals(Buffer.from([0xff, 0xd8, 0xff]));
	return isPdf || isPng || isJpeg;
}

function rejectInvalidPdf(req, res, next) {
	const files = req.file ? [req.file] : req.files || [];
	if (!files.every(isAllowedDocumentBuffer)) {
		res
			.status(400)
			.json({
				error: "Arquivo invalido ou corrompido. Envie PDF, PNG ou JPG.",
			});
		return;
	}
	next();
}

function uploadSingleFile(req, res, next) {
	upload.single("file")(req, res, (error) => {
		if (!error) {
			next();
			return;
		}
		if (error instanceof multer.MulterError) {
			const tooLarge = ["LIMIT_FILE_SIZE", "LIMIT_TOTAL_FILE_SIZE"].includes(
				error.code,
			);
			const statusCode = tooLarge ? 413 : 400;
			res.status(statusCode).json({
				error:
					tooLarge
						? "Arquivo maior que o limite permitido."
						: `Erro no upload: ${error.message}`,
			});
			return;
		}
		if (error?.message === "Apenas arquivos PDF, PNG ou JPG sao aceitos.") {
			res.status(400).json({ error: error.message });
			return;
		}
		next(error);
	});
}

function uploadManyFiles(req, res, next) {
	upload.array("files", UPLOAD_MAX_FILES)(req, res, (error) => {
		if (!error) {
			next();
			return;
		}
		if (error instanceof multer.MulterError) {
			const tooLarge = ["LIMIT_FILE_SIZE", "LIMIT_TOTAL_FILE_SIZE"].includes(
				error.code,
			);
			const statusCode = tooLarge ? 413 : 400;
			res.status(statusCode).json({
				error:
					tooLarge
						? error.message || "Arquivo maior que o limite permitido."
						: `Erro no upload: ${error.message}`,
			});
			return;
		}
		if (error?.message === "Apenas arquivos PDF, PNG ou JPG sao aceitos.") {
			res.status(400).json({ error: error.message });
			return;
		}
		next(error);
	});
}

function createDocumentosRouter({
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
	adminRoles = ["admin"],
}) {
	const router = express.Router();
	const requireAdmin = requireRoles
		? requireRoles(adminRoles)
		: (_req, _res, next) => next();

	router.use(requireAuthenticated);
	router.get("/google/callback", requireAdmin, controller.googleCallback);
	router.get("/google/status", controller.googleStatus);
	router.get("/google/config", requireAdmin, controller.googleConfig);
	router.post(
		"/google/config",
		requireCsrfToken,
		requireAdmin,
		controller.saveGoogleConfig,
	);
	router.get("/google/auth-url", requireAdmin, controller.googleAuthUrl);
	router.get("/fields", controller.listFields);
	router.post("/fields", requireCsrfToken, requireAdmin, controller.saveField);
	router.get("/invoice-fields", controller.listInvoiceFields);
	router.post(
		"/invoice-fields",
		requireCsrfToken,
		requireAdmin,
		controller.saveInvoiceField,
	);
	router.get("/billing-config", requireAdmin, controller.getBillingConfig);
	router.post(
		"/billing-config",
		requireCsrfToken,
		requireAdmin,
		controller.saveBillingConfig,
	);
	router.post(
		"/admin/purge-history",
		requireCsrfToken,
		requireAdmin,
		controller.purgeHistory,
	);
	router.get("/submissions", controller.listSubmissions);
	router.get(
		"/submissions/resumo",
		requireAuthenticated,
		controller.getSubmissionsDashboardSummary,
	);
	router.get("/submissions/tratativas", controller.listSupervisorTreatments);
	router.get("/submissions/:id/zip", controller.downloadSubmissionZip);
	router.get("/submissions/:id", controller.getSubmission);
	router.post(
		"/submissions",
		requireCsrfToken,
		uploadManyFiles,
		rejectInvalidPdf,
		controller.createSubmission,
	);
	router.post(
		"/submissions/:id/invoices",
		requireCsrfToken,
		uploadManyFiles,
		rejectInvalidPdf,
		controller.uploadSubmissionInvoices,
	);
	router.patch(
		"/submissions/:id/review",
		requireCsrfToken,
		controller.reviewSubmission,
	);
	router.get("/", controller.list);
	router.get("/folders/:empresaId/browser", controller.browseCompanyFolder);
	router.get(
		"/folders/:empresaId/browser/:fileId/download",
		controller.downloadCompanyDriveFile,
	);
	router.get("/:id/download", controller.download);
	router.post("/folders/:empresaId", requireCsrfToken, controller.ensureFolder);
	router.post(
		"/folders/:empresaId/subfolders",
		requireCsrfToken,
		controller.createSubfolder,
	);
	router.post(
		"/upload",
		requireCsrfToken,
		uploadSingleFile,
		rejectInvalidPdf,
		controller.upload,
	);
	router.patch("/:id/rename", requireCsrfToken, controller.rename);
	router.patch("/:id/approval", requireCsrfToken, controller.approval);
	router.delete("/:id", requireCsrfToken, controller.remove);

	return router;
}

module.exports = createDocumentosRouter;
module.exports.createBoundedMemoryStorage = createBoundedMemoryStorage;
module.exports.uploadLimits = {
	fileSize: UPLOAD_FILE_LIMIT_BYTES,
	files: UPLOAD_MAX_FILES,
	totalSize: UPLOAD_TOTAL_LIMIT_BYTES,
};
