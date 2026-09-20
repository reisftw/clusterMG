function plainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendBadRequest(res, message) {
	res.status(400).json({ ok: false, error: message });
}

function validateBody(allowedFields, options = {}) {
	const allowed = new Set(allowedFields || []);
	const allowEmpty = options.allowEmpty !== false;
	return (req, res, next) => {
		const body = req.body || {};
		if (!plainObject(body)) {
			sendBadRequest(res, "Corpo da requisição inválido.");
			return;
		}
		const keys = Object.keys(body);
		if (!allowEmpty && keys.length === 0) {
			sendBadRequest(res, "Corpo da requisição obrigatório.");
			return;
		}
		const unknown = keys.filter((key) => !allowed.has(key));
		if (unknown.length) {
			sendBadRequest(res, `Campo(s) não permitido(s): ${unknown.join(", ")}.`);
			return;
		}
		next();
	};
}

module.exports = {
	validateBody,
};
