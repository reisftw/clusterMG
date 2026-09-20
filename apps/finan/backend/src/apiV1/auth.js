// Roteiro Finan #26 (API interna oficial /api/v1): checagem de permissão
// que devolve o erro no envelope novo. `auth/middleware.js#requireFinanPermission`
// (usado por TODAS as rotas legadas) responde 403 direto com
// `res.status(403).json({ok:false,error:"string"})`, sem passar por
// next(error) — não dá pra reaproveitar sem quebrar o formato que o
// frontend legado já espera em ~30 arquivos de rota. Esta versão usa a
// mesma checagem (`userHasFinanPermission`, já exportada) mas lança
// `ApiError.forbidden(...)` via next(), pro errorHandler de envelope.js
// responder `{ok:false,error:{code:"FORBIDDEN",message}}` como qualquer
// outro erro v1.
const { userHasFinanPermission } = require("../auth/middleware");
const { ApiError } = require("./ApiError");

function requireApiV1Permission(permission) {
	const required = Array.isArray(permission) ? permission : [permission];
	return (req, _res, next) => {
		if (required.some((item) => userHasFinanPermission(req.finanUser, item))) {
			next();
			return;
		}
		next(ApiError.forbidden("Você não tem permissão para acessar esta área do Finan."));
	};
}

module.exports = { requireApiV1Permission };
