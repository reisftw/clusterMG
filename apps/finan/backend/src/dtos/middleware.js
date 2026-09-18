// Middleware reutilizavel de validacao de requisicao. Em vez de repetir
// `schema.parse(req.body)` em cada controller/rota, monta-se uma vez
// `validate({ body, params, query })` e o resultado fica disponivel em
// `req.validated.{body,params,query}` — o handler passa a ler só dali, nunca
// mais `req.body`/`req.params`/`req.query` crus (ver `docs/DTO-MAPPING.md`
// para o racional).
//
// `body`/`params`/`query` podem ser:
//   - a funcao de schema direto (equivalente a `{ partial: false }`);
//   - `{ schema, partial: true }` para aceitar atualizacao parcial (PATCH) —
//     campos ausentes no payload nao geram erro nem entram no resultado.
function toSpec(value) {
	if (!value) return null;
	if (typeof value === "function") return { schema: value, partial: false };
	return { schema: value.schema, partial: Boolean(value.partial) };
}

function validate({ body, params, query } = {}) {
	const bodySpec = toSpec(body);
	const paramsSpec = toSpec(params);
	const querySpec = toSpec(query);
	return (req, res, next) => {
		try {
			const validated = {};
			if (bodySpec) validated.body = bodySpec.schema(req.body, { partial: bodySpec.partial });
			if (paramsSpec) validated.params = paramsSpec.schema(req.params, { partial: paramsSpec.partial });
			if (querySpec) validated.query = querySpec.schema(req.query, { partial: querySpec.partial });
			req.validated = validated;
			next();
		} catch (error) {
			next(error);
		}
	};
}

module.exports = { validate };
