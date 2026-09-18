// Roteiro Finan #26 (API interna oficial do Finan /api/v1): router
// agregador das rotas AUTENTICADAS de v1. `/api/v1/health` fica de fora
// desse router de propósito — é público (mesmo critério de
// /api/finan/health hoje) e por isso app.js monta o módulo de health
// separadamente, ANTES de requireFinanAuth; este router aqui é montado
// DEPOIS (requireFinanPermission, usado em todo sub-router abaixo,
// depende de req.finanUser já estar setado por requireFinanAuth).
//
// Estratégia de migração (ver plano no Roteiro): as rotas legadas
// /api/finan/* continuam funcionando em paralelo, sem prazo de
// descontinuação definido ainda. /api/v1 é aditivo, não substitui nada
// hoje. Reaproveita os mesmos services/repositories das rotas legadas
// (qualidadeDados/service.js, observabilidade/service.js,
// jobs/jobExecutionService.js) — nunca duplica lógica de negócio, só o
// formato de entrada/saída.
const express = require("express");
const { errorHandler } = require("./envelope");
const qualidadeDadosRoutes = require("./routes/qualidadeDados");
const jobsRoutes = require("./routes/jobs");
const observabilidadeRoutes = require("./routes/observabilidade");

function createApiV1Router() {
	const router = express.Router();

	router.use("/qualidade-dados", qualidadeDadosRoutes);
	router.use("/jobs", jobsRoutes);
	router.use("/observabilidade", observabilidadeRoutes);

	router.use((req, res) => {
		res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Rota /api/v1 não encontrada." } });
	});
	// Middleware de 4 argumentos = error handler do Express — captura
	// qualquer next(error) disparado pelas rotas acima e responde no
	// envelope novo, sem cair no handler global de app.js (que continua no
	// formato legado, usado por /api/finan/* e /api/*).
	router.use(errorHandler);

	return router;
}

module.exports = { createApiV1Router };
