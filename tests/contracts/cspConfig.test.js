import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Nao é um contrato compartilhado de verdade: Retiradas e Operacao tem
// politicas de CSP deliberadamente diferentes (cada uma com seu proprio
// incidente/motivo documentado no respectivo arquivo), entao cada uma é
// verificada contra a sua PRÓPRIA política, não uma regra comum.

function readConfig(relativePath) {
	return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Operacao: nginx CSP não permite style-src inline amplo", () => {
	const config = readConfig("apps/operacao/ops/nginx-operacao.conf.example");

	assert.ok(!config.includes("style-src 'self' 'unsafe-inline'"));
	assert.ok(config.includes("style-src-attr 'unsafe-inline'"));
	assert.ok(config.includes("object-src 'none'"));
});

test("Retiradas: nginx aplica a politica versionada em todas as respostas estaticas", () => {
	const config = readConfig("apps/retiradas/backend/nginx/retiradas.conf");
	const headers = readConfig(
		"apps/retiradas/backend/nginx/retiradas-security-headers.conf",
	);

	assert.equal(
		config.match(/include \/etc\/nginx\/snippets\/retiradas-security-headers\.conf;/g)?.length,
		5,
	);
	assert.match(headers, /Content-Security-Policy/);
	assert.ok(headers.includes("https://fonts.googleapis.com"));
	assert.ok(headers.includes("style-src 'self' 'unsafe-inline'"));
	assert.ok(headers.includes("https://accounts.google.com"));
	assert.ok(headers.includes("object-src 'none'"));
	assert.ok(headers.includes("frame-ancestors 'self'"));
	assert.ok(headers.includes('Strict-Transport-Security "max-age=31536000"'));
	assert.ok(!headers.includes("includeSubDomains"));
});
