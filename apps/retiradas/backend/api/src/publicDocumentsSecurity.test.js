const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("colecoes operacionais nao possuem rota publica ou atalho sem autenticacao", () => {
	const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

	assert.doesNotMatch(source, /app\.get\("\/api\/public\/documents"/);
	assert.match(source, /const AUTHENTICATED_SHARED_COLLECTIONS/);
	assert.match(
		source,
		/app\.get\("\/api\/documents", requireAuthenticated/,
	);
});
