// Erro de validacao de DTO. Tem uma forma propria (`.fields`, `.code`) que
// `security/errors.js#toClientResponse` reconhece explicitamente e serializa
// como `{ ok:false, error, code: "VALIDATION_ERROR", fields }` — ver ali para
// o motivo de manter `error` como mensagem legivel (compatibilidade com o
// front, que hoje faz `data?.error` como mensagem de erro pro usuario) em vez
// de so o codigo.
class ValidationError extends Error {
	constructor(fields, message = "Dados inválidos.") {
		super(message);
		this.name = "ValidationError";
		this.status = 400;
		this.code = "VALIDATION_ERROR";
		this.fields = fields && typeof fields === "object" ? fields : {};
	}
}

module.exports = { ValidationError };
