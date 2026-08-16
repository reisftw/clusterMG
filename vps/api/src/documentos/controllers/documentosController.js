const service = require("../services/documentosService");
const googleDrive = require("../services/googleDriveService");

function parsePaging(query = {}) {
  return {
    limit: Math.max(Math.min(Number(query.limit || 20), 100), 1),
    offset: Math.max(Number(query.offset || 0), 0),
  };
}

async function list(req, res, next) {
  try {
    const items = await service.listDocuments({
      status: req.query.status,
      empresaId: req.query.empresaId,
      ...parsePaging(req.query),
      user: req.user,
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function listFields(req, res, next) {
  try {
    res.json({ items: await service.listRequiredFields({ includeInactive: req.query.includeInactive === "true" }) });
  } catch (error) {
    next(error);
  }
}

async function saveField(req, res, next) {
  try {
    const field = await service.saveRequiredField({
      id: req.body?.id,
      nome: req.body?.nome,
      obrigatorio: req.body?.obrigatorio,
      ordem: req.body?.ordem,
      publicoAlvo: req.body?.publicoAlvo || req.body?.publico_alvo,
      ativo: req.body?.ativo,
    });
    res.json({ ok: true, field });
  } catch (error) {
    next(error);
  }
}

async function getBillingConfig(req, res, next) {
  try {
    res.json(await service.getBillingConfig());
  } catch (error) {
    next(error);
  }
}

async function saveBillingConfig(req, res, next) {
  try {
    res.json({ ok: true, config: await service.saveBillingConfig(req.body || {}, req.user) });
  } catch (error) {
    next(error);
  }
}

async function purgeHistory(req, res, next) {
  try {
    res.json(await service.purgeDocumentHistory({
      deleteDriveFiles: req.body?.deleteDriveFiles === true,
      resetFolders: req.body?.resetFolders === true,
      confirmation: req.body?.confirmation,
      user: req.user,
    }));
  } catch (error) {
    next(error);
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function createSubmission(req, res, next) {
  try {
    const submission = await service.createMonthlySubmission({
      mesReferencia: req.body?.mesReferencia,
      fieldIds: parseJsonArray(req.body?.fieldIds),
      files: req.files || [],
      user: req.user,
    });
    res.json({ ok: true, submission });
  } catch (error) {
    next(error);
  }
}

async function listSubmissions(req, res, next) {
  try {
    const paging = parsePaging(req.query);
    const items = await service.listSubmissions({
      status: req.query.status,
      empresaId: req.query.empresaId,
      mine: req.query.mine === "true",
      ...paging,
      user: req.user,
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function listSupervisorTreatments(req, res, next) {
  try {
    const paging = parsePaging(req.query);
    const items = await service.listSupervisorTreatments({
      ...paging,
      user: req.user,
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getSubmission(req, res, next) {
  try {
    res.json(await service.getSubmissionWithFiles({ id: req.params.id, user: req.user }));
  } catch (error) {
    next(error);
  }
}

async function downloadSubmissionZip(req, res, next) {
  try {
    const { fileName, stream } = await service.downloadSubmissionZip({
      id: req.params.id,
      user: req.user,
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    const zipError = new Error(`Falha ao gerar ZIP: ${error?.message || "erro desconhecido"}`);
    zipError.statusCode = error?.statusCode || 502;
    next(zipError);
  }
}

async function reviewSubmission(req, res, next) {
  try {
    const submission = await service.reviewSubmission({
      id: req.params.id,
      status: req.body?.status,
      motivo: req.body?.motivo,
      user: req.user,
    });
    res.json({ ok: true, submission });
  } catch (error) {
    next(error);
  }
}

async function ensureFolder(req, res, next) {
  try {
    const folder = await service.createClientFolder({
      empresaId: req.params.empresaId,
      user: req.user,
    });
    res.json({ ok: true, folder });
  } catch (error) {
    next(error);
  }
}

async function createSubfolder(req, res, next) {
  try {
    const folder = await service.createSubfolder({
      empresaId: req.params.empresaId,
      name: req.body?.name,
      user: req.user,
    });
    res.json({ ok: true, folder });
  } catch (error) {
    next(error);
  }
}

async function browseCompanyFolder(req, res, next) {
  try {
    res.json(await service.listCompanyDriveFolder({
      empresaId: req.params.empresaId,
      folderId: req.query.folderId,
      user: req.user,
    }));
  } catch (error) {
    next(error);
  }
}

async function downloadCompanyDriveFile(req, res, next) {
  try {
    const { file, stream } = await service.downloadCompanyDriveFile({
      empresaId: req.params.empresaId,
      fileId: req.params.fileId,
      folderId: req.query.folderId,
      user: req.user,
    });
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    const disposition = req.query.inline === "true" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.nome)}`);
    stream.on("error", next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function upload(req, res, next) {
  try {
    const document = await service.uploadDocument({
      empresaId: req.body?.empresaId,
      tipo: req.body?.tipo,
      file: req.file,
      user: req.user,
    });
    res.json({ ok: true, document });
  } catch (error) {
    next(error);
  }
}

async function download(req, res, next) {
  try {
    const { file, stream } = await service.downloadDocument({
      id: req.params.id,
      user: req.user,
    });
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.nome)}"`);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function rename(req, res, next) {
  try {
    const document = await service.renameDocument({
      id: req.params.id,
      name: req.body?.name,
      user: req.user,
    });
    res.json({ ok: true, document });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const document = await service.deleteDocument({
      id: req.params.id,
      user: req.user,
    });
    res.json({ ok: true, document });
  } catch (error) {
    next(error);
  }
}

async function approval(req, res, next) {
  try {
    const document = await service.updateApproval({
      id: req.params.id,
      status: req.body?.status,
      motivo: req.body?.motivo,
      user: req.user,
    });
    res.json({ ok: true, document });
  } catch (error) {
    next(error);
  }
}

async function googleStatus(req, res, next) {
  try {
    res.json(await googleDrive.getDriveStatus());
  } catch (error) {
    next(error);
  }
}

async function googleConfig(req, res, next) {
  try {
    res.json(await googleDrive.getDriveStatus());
  } catch (error) {
    next(error);
  }
}

async function saveGoogleConfig(req, res, next) {
  try {
    const status = await googleDrive.saveDriveConfig({
      folderId: req.body?.folderId,
      oauthClientId: req.body?.oauthClientId,
      oauthClientSecret: req.body?.oauthClientSecret,
      oauthRedirectUri: req.body?.oauthRedirectUri,
    }, req.user);
    res.json({ ok: true, ...status });
  } catch (error) {
    next(error);
  }
}

async function googleAuthUrl(req, res, next) {
  try {
    res.json({ url: await googleDrive.getOAuthAuthUrl() });
  } catch (error) {
    next(error);
  }
}

async function googleCallback(req, res, next) {
  try {
    if (!req.query.code) {
      res.status(400).send("Codigo OAuth ausente.");
      return;
    }
    await googleDrive.connectOAuth(req.query.code, req.user || {});
    res.send(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>Google Drive conectado</title></head>
  <body style="font-family:Arial,sans-serif;padding:32px">
    <h1>Google Drive conectado com sucesso.</h1>
    <p>Você já pode voltar ao sistema Retiradas.</p>
    <script>setTimeout(function(){ window.location.href = "/documentos/pendentes"; }, 1200);</script>
  </body>
</html>`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  approval,
  browseCompanyFolder,
  createSubfolder,
  createSubmission,
  download,
  downloadCompanyDriveFile,
  downloadSubmissionZip,
  ensureFolder,
  getSubmission,
  googleAuthUrl,
  googleCallback,
  googleConfig,
  saveGoogleConfig,
  googleStatus,
  getBillingConfig,
  listFields,
  list,
  listSubmissions,
  listSupervisorTreatments,
  purgeHistory,
  remove,
  rename,
  reviewSubmission,
  saveBillingConfig,
  saveField,
  upload,
};
