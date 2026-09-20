// Erro de validacao de DTO (Fase C da otimizacao tecnica —
// docs/TECHNICAL-AUDIT.md). Mesmo padrao ja usado e comprovado no backend
// dedicado do Finan (apps/finan/backend/src/dtos/errors.js) — replicado
// aqui, adaptado ao formato de erro que o handler global de `app.js`
// (`error.statusCode`) ja espera (Finan usa `error.status`; o app
// principal usa `error.statusCode` em todo o resto do codigo, ver
// vps/api/src/security/regionalScope.js e o handler de erro de app.js).
class ValidationError extends Error {
	constructor(fields, message = "Dados invalidos.") {
		super(message);
		this.name = "ValidationError";
		this.statusCode = 400;
		this.code = "VALIDATION_ERROR";
		this.fields = fields && typeof fields === "object" ? fields : {};
	}
}

module.exports = { ValidationError };
