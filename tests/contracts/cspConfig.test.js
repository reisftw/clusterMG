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

test("Retiradas: nginx tem header CSP presente com origem de fonte explícita", () => {
	// Retiradas usa style-src 'self' 'unsafe-inline' de proposito (ver
	// comentario no proprio arquivo, incidente de 2026-09-09 com Google
	// Fonts) — politica mais permissiva que a da Operacao, não uma
	// regressao. Só confirma que o header existe e que a origem de fonte
	// segue explícita (allowlist, não wildcard).
	const config = readConfig("apps/retiradas/backend/nginx/retiradas.conf");

	assert.match(config, /Content-Security-Policy/);
	assert.ok(config.includes("https://fonts.googleapis.com"));
	assert.ok(!config.includes("style-src *"));
});
