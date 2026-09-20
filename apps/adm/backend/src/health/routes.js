const express = require("express");

// Health check minimo do ADM (Etapa 8, Fase 5): sem autenticacao, sem
// consulta ao banco — so confirma que o processo HTTP esta vivo. O
// status detalhado (com banco, autenticado) continua em
// /api/admin/api-status (apiStatus.js), inalterado.
const router = express.Router();

router.get("/", (_req, res) => {
	res.status(200).json({ ok: true, service: "adm-api" });
});

module.exports = router;
