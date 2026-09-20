// Roteiro Finan #29 (Fase 4A — Qualidade de Dados): painel de saude do
// dado cadastral/financeiro, so leitura — nenhuma checagem aqui corrige
// nada por conta propria, so mede e aponta pra onde corrigir (mesmo
// espirito da Central de Pendencias em pendencias/routes.js, mas focado
// em qualidade estrutural do cadastro, nao em prazo/vencimento).
//
// A logica das checagens mora em service.js (Roteiro #26 — API /api/v1
// reaproveita o mesmo service em vez de duplicar as queries).
const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { getQualidadeDados } = require("./service");

const router = express.Router();

router.use(requireFinanPermission("finan.qualidade_dados.view"));
router.use(noStore);

router.get("/", async (_req, res, next) => {
	try {
		const { score, checks } = await getQualidadeDados();
		res.json({ ok: true, score, checks });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
