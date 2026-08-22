function getProfile(req) {
  return req.user?.profile || req.user || {};
}

function createEmailAdminController({ emailService, notificationsService }) {
  async function getConfig(req, res, next) {
    try {
      res.json({ ok: true, config: emailService.sanitizeConfig(await emailService.getConfig()) });
    } catch (error) {
      notificationsService.createNotification({
        type: "backup",
        title: "Falha ao gerar backup",
        message: error?.message || "Não foi possível gerar o backup do PostgreSQL.",
        targetPath: "/configuracoes/banco-de-dados",
        severity: "critical",
        user: getProfile(req),
        targets: { roles: ["admin"] },
        meta: { event: "backup_failed" },
      }).catch((notifyError) => console.warn("[notifications] Falha ao avisar erro de backup:", notifyError?.message || notifyError));
      next(error);
    }
  }

  async function saveConfig(req, res, next) {
    try {
      res.json({ ok: true, config: await emailService.saveConfig(req.body || {}) });
    } catch (error) {
      notificationsService.createNotification({
        type: "backup",
        title: "Falha no rollback",
        message: error?.message || "Não foi possível restaurar o backup selecionado.",
        targetPath: "/configuracoes/banco-de-dados",
        severity: "critical",
        user: getProfile(req),
        targets: { roles: ["admin"] },
        meta: { event: "backup_restore_failed", fileName: req.params.fileName },
      }).catch((notifyError) => console.warn("[notifications] Falha ao avisar erro de restore:", notifyError?.message || notifyError));
      next(error);
    }
  }

  async function sendTestEmail(req, res, next) {
    try {
      res.json(await emailService.sendTestEmail(req.body?.to || req.user?.email));
    } catch (error) {
      next(error);
    }
  }

  async function listEmailLogs(req, res, next) {
    try {
      res.json({
        ok: true,
        ...(await emailService.listEmailLogs({
          limit: req.query.limit,
          offset: req.query.offset,
          status: req.query.status,
          type: req.query.type,
          q: req.query.q,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  return {
    getConfig,
    listEmailLogs,
    saveConfig,
    sendTestEmail,
  };
}

module.exports = {
  createEmailAdminController,
};
