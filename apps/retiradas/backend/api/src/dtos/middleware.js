// Middleware de validacao reutilizavel (Fase C). Em vez de repetir
// validacao manual em cada rota, monta-se `validate({ body, params, query })`
// e o handler passa a ler so `req.validated.{body,params,query}` — nunca
// mais `req.body`/`req.params`/`req.query` crus nos endpoints migrados.
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
