// Roteiro Finan #26 (API interna oficial /api/v1): envelope único de
// sucesso/erro pra toda rota v1 — resolve a inconsistência #4 do
// inventário (3 formatos de sucesso coexistindo, chave de payload
// variando por módulo) e a #5 (erro montado manualmente em cada rota).
const { ApiError } = require("./ApiError");
const { isDatabaseError, resolveStatusCode } = require("../security/errors");

/** `{ ok: true, data, meta? }` — sempre a mesma chave (`data`) pro payload,
 * `meta` só quando a rota pagina (ver pagination.js). */
function sendData(res, data, { meta, status = 200 } = {}) {
	const body = { ok: true, data };
	if (meta) body.meta = meta;
	res.status(status).json(body);
}

/** Vai no fim do router de cada módulo v1 (Express só invoca middleware de
 * 4 argumentos como error handler) — assim cada sub-router do /api/v1
 * responde no formato novo sem depender do handler global de app.js
 * (que continua no formato legado, usado por /api/finan/* e /api/*). */
function errorHandler(error, _req, res, _next) {
	// Erro de validacao de DTO (dtos/errors.js:ValidationError) — mesma
	// forma que o handler legado ja reconhece (.fields), so que aqui vira
	// `details` dentro do envelope novo em vez de `fields` solto no root.
	if (error?.code === "VALIDATION_ERROR" && error.fields) {
		res.status(error.status || 400).json({
			ok: false,
			error: { code: "VALIDATION_ERROR", message: error.message || "Dados inválidos.", details: error.fields },
		});
		return;
	}
	if (error instanceof ApiError) {
		res.status(error.status).json({
			ok: false,
			error: { code: error.code, message: error.message, details: error.details },
		});
		return;
	}
	// Erro cru do driver pg (SQLSTATE) — nunca vaza mensagem/stack do banco
	// pro cliente, mesmo criterio ja usado no handler legado.
	if (isDatabaseError(error)) {
		res.status(resolveStatusCode(error) >= 400 ? resolveStatusCode(error) : 500).json({
			ok: false,
			error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." },
		});
		return;
	}
	// Erro generico lançado pelo proprio codigo (Error com .status/.statusCode
	// opcional, mesmo padrao usado nas rotas legadas) — mensagem passa
	// direto, igual o handler legado ja faz hoje.
	const status = resolveStatusCode(error);
	res.status(status).json({
		ok: false,
		error: { code: status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR", message: error?.message || "Erro interno do Finan." },
	});
}

module.exports = { sendData, errorHandler };
