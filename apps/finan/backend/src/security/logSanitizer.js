// Helper central de sanitizacao de log. Qualquer chave que bata com o
// padrao abaixo (case-insensitive, com ou sem separador) tem o valor
// substituido por "***" antes de ir pro log — nunca altera o dado original,
// so a copia usada para logging.
const SENSITIVE_KEY_PATTERN =
	/(password|senha|token|secret|clientsecret|client_secret|accesstoken|refreshtoken|apikey|api_key|authorization|cookie)/i;

const MAX_DEPTH = 6;

function isPlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Retorna uma copia de `value` com qualquer campo sensivel mascarado.
 * Nao muda o objeto original. Seguro para usar antes de console.log/error.
 */
function sanitizeForLog(value, depth = 0) {
	if (depth >= MAX_DEPTH || value === null || value === undefined) return value;

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeForLog(item, depth + 1));
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			code: value.code,
			status: value.status || value.statusCode,
		};
	}

	if (isPlainObject(value)) {
		const result = {};
		for (const [key, item] of Object.entries(value)) {
			result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "***" : sanitizeForLog(item, depth + 1);
		}
		return result;
	}

	return value;
}

module.exports = { sanitizeForLog, SENSITIVE_KEY_PATTERN };
