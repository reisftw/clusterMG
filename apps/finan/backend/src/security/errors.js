// Separa erro de negocio (mensagem pode ir pro cliente) de erro interno
// (erro cru do driver `pg`, bug inesperado etc. — mensagem fica so no log).
//
// Criterio: um erro e "de banco" quando tem a forma de um DatabaseError do
// driver `pg` (SQLSTATE de 5 caracteres em `error.code`, mais campos como
// `severity`/`table`/`constraint`/`detail` que so o driver preenche).
// Erros lancados pelo proprio codigo da aplicacao (`new Error("...")`,
// `httpError("...")`) nunca tem esse formato, entao a mensagem deles
// continua chegando ao cliente exatamente como hoje — nao mudamos nenhuma
// mensagem de validacao existente.
const PG_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

function isDatabaseError(error) {
	if (!error || typeof error !== "object") return false;
	const hasSqlState = typeof error.code === "string" && PG_SQLSTATE_PATTERN.test(error.code);
	const hasPgShape =
		"severity" in error || "table" in error || "constraint" in error || "schema" in error;
	return hasSqlState && hasPgShape;
}

function resolveStatusCode(error) {
	const status = Number(error?.status ?? error?.statusCode);
	return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
}

/**
 * Decide o que responder ao cliente para um erro que chegou ao handler
 * global. Nunca deixa passar `.stack`.
 *
 * Importante: so trocamos a mensagem quando o erro tem a "forma" de um
 * erro cru do driver `pg` (isDatabaseError). Qualquer `Error`/`httpError`
 * lancado pelo proprio codigo da aplicacao — com ou sem `.status`
 * explicito — continua devolvendo `error.message` exatamente como hoje.
 * Isso preserva mensagens de validacao existentes (ex.: "SMTP incompleto.
 * Configure host, porta, usuário e senha.") que hoje saem em erros sem
 * status definido.
 */
function toClientResponse(error) {
	const status = resolveStatusCode(error);
	if (isDatabaseError(error)) {
		return {
			status: status >= 400 && status < 600 ? status : 500,
			body: { ok: false, error: "Erro interno do servidor." },
		};
	}
	// Erro de DTO (ver `dtos/errors.js`): forma propria com `.fields`, um mapa
	// `{ campo: "mensagem" }`. `error` continua sendo a mensagem legivel
	// generica ("Dados inválidos.") — o front hoje usa `data?.error` como
	// mensagem de erro pro usuario (ver `frontend/src/api/finanApi.js`), entao
	// mantemos isso funcionando sem mudanca nenhuma la; `fields` fica
	// disponivel para quem quiser exibir erro por campo.
	if (error?.code === "VALIDATION_ERROR" && error.fields) {
		return {
			status,
			body: { ok: false, error: error.message || "Dados inválidos.", code: error.code, fields: error.fields },
		};
	}
	return { status, body: { ok: false, error: error?.message || "Erro interno do Finan." } };
}

module.exports = { isDatabaseError, resolveStatusCode, toClientResponse };
