const express = require("express");
const multer = require("multer");
const controller = require("../controllers/documentosController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.DOCUMENTOS_UPLOAD_LIMIT_BYTES || 25 * 1024 * 1024),
    files: Number(process.env.DOCUMENTOS_UPLOAD_MAX_FILES || 30),
  },
  fileFilter: (_req, file, cb) => {
    const name = String(file?.originalname || "").toLowerCase();
    const mime = String(file?.mimetype || "").toLowerCase();
    const allowed =
      (mime === "application/pdf" && name.endsWith(".pdf")) ||
      (["image/png", "image/jpeg"].includes(mime) && /\.(png|jpe?g)$/.test(name));
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
    res.status(400).json({ error: "Arquivo invalido ou corrompido. Envie PDF, PNG ou JPG." });
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
      const statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(statusCode).json({
        error: error.code === "LIMIT_FILE_SIZE"
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
  upload.array("files", 30)(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(statusCode).json({
        error: error.code === "LIMIT_FILE_SIZE"
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

function createDocumentosRouter({ requireAuthenticated, requireCsrfToken, requireRoles, adminRoles = ["admin"] }) {
  const router = express.Router();
  const requireAdmin = requireRoles ? requireRoles(adminRoles) : (_req, _res, next) => next();

  router.get("/google/callback", controller.googleCallback);
  router.use(requireAuthenticated);
  router.get("/google/status", controller.googleStatus);
  router.get("/google/config", requireAdmin, controller.googleConfig);
  router.post("/google/config", requireCsrfToken, requireAdmin, controller.saveGoogleConfig);
  router.get("/google/auth-url", requireAdmin, controller.googleAuthUrl);
  router.get("/fields", controller.listFields);
  router.post("/fields", requireCsrfToken, requireAdmin, controller.saveField);
  router.get("/billing-config", requireAdmin, controller.getBillingConfig);
  router.post("/billing-config", requireCsrfToken, requireAdmin, controller.saveBillingConfig);
  router.post("/admin/purge-history", requireCsrfToken, requireAdmin, controller.purgeHistory);
  router.get("/submissions", controller.listSubmissions);
  router.get("/submissions/tratativas", controller.listSupervisorTreatments);
  router.get("/submissions/:id/zip", controller.downloadSubmissionZip);
  router.get("/submissions/:id", controller.getSubmission);
  router.post("/submissions", requireCsrfToken, uploadManyFiles, rejectInvalidPdf, controller.createSubmission);
  router.patch("/submissions/:id/review", requireCsrfToken, controller.reviewSubmission);
  router.get("/", controller.list);
  router.get("/folders/:empresaId/browser", controller.browseCompanyFolder);
  router.get("/folders/:empresaId/browser/:fileId/download", controller.downloadCompanyDriveFile);
  router.get("/:id/download", controller.download);
  router.post("/folders/:empresaId", requireCsrfToken, controller.ensureFolder);
  router.post("/folders/:empresaId/subfolders", requireCsrfToken, controller.createSubfolder);
  router.post("/upload", requireCsrfToken, uploadSingleFile, rejectInvalidPdf, controller.upload);
  router.patch("/:id/rename", requireCsrfToken, controller.rename);
  router.patch("/:id/approval", requireCsrfToken, controller.approval);
  router.delete("/:id", requireCsrfToken, controller.remove);

  return router;
}

module.exports = createDocumentosRouter;
