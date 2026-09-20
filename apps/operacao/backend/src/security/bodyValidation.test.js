const assert = require("node:assert/strict");
const test = require("node:test");
const { validateBody } = require("./bodyValidation.js");

function runMiddleware(body, allowedFields, options) {
	let statusCode = null;
	let statusCalled = false;
	let jsonBody = null;
	let jsonCalled = false;
	let nextCalls = 0;
	const response = {
		status(code) {
			statusCalled = true;
			statusCode = code;
			return this;
		},
		json(payload) {
			jsonCalled = true;
			jsonBody = payload;
		},
	};
	const next = () => {
		nextCalls += 1;
	};

	validateBody(allowedFields, options)({ body }, response, next);

	return { statusCalled, statusCode, jsonCalled, jsonBody, nextCalls };
}

test("allows only whitelisted fields", () => {
	const result = runMiddleware({ username: "admin", password: "secret" }, ["username", "password"], { allowEmpty: false });

	assert.equal(result.nextCalls, 1);
	assert.equal(result.statusCalled, false);
	assert.equal(result.jsonCalled, false);
});

test("rejects unknown fields before route handlers run", () => {
	const result = runMiddleware({ username: "admin", password: "secret", role: "site_admin" }, ["username", "password"], { allowEmpty: false });

	assert.equal(result.nextCalls, 0);
	assert.equal(result.statusCode, 400);
	assert.deepEqual(result.jsonBody, {
		ok: false,
		error: "Campo(s) não permitido(s): role.",
	});
});

test("rejects non-object bodies and required empty bodies", () => {
	assert.equal(runMiddleware([], ["name"]).statusCode, 400);
	assert.equal(runMiddleware({}, ["name"], { allowEmpty: false }).statusCode, 400);
});
