// Roteiro Finan #26 (API interna oficial /api/v1): erro tipado padrão
// pra toda rota v1. Em vez de `res.status(x).json({ok:false,error})`
// manual espalhado (o padrão dominante nas rotas legadas /api/finan/* —
// ver inventário), a rota v1 lança `new ApiError(...)` e deixa o
// errorHandler central (ver envelope.js) montar a resposta.
const DEFAULT_MESSAGES = {
	VALIDATION_ERROR: "Dados inválidos.",
	UNAUTHORIZED: "Não autenticado.",
	FORBIDDEN: "Sem permissão para esta ação.",
	NOT_FOUND: "Recurso não encontrado.",
	CONFLICT: "Conflito com o estado atual do recurso.",
	RATE_LIMITED: "Muitas requisições. Tente novamente em instantes.",
	INTERNAL_ERROR: "Erro interno do servidor.",
};

const STATUS_BY_CODE = {
	VALIDATION_ERROR: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	RATE_LIMITED: 429,
	INTERNAL_ERROR: 500,
};

class ApiError extends Error {
	constructor(code, message, { status, details } = {}) {
		const resolvedCode = DEFAULT_MESSAGES[code] !== undefined ? code : "INTERNAL_ERROR";
		super(message || DEFAULT_MESSAGES[resolvedCode]);
		this.name = "ApiError";
		this.code = resolvedCode;
		this.status = status || STATUS_BY_CODE[resolvedCode] || 500;
		this.details = details;
	}

	static notFound(message, details) {
		return new ApiError("NOT_FOUND", message, { details });
	}

	static validation(message, details) {
		return new ApiError("VALIDATION_ERROR", message, { details });
	}

	static forbidden(message) {
		return new ApiError("FORBIDDEN", message);
	}

	static conflict(message, details) {
		return new ApiError("CONFLICT", message, { details });
	}
}

module.exports = { ApiError };
