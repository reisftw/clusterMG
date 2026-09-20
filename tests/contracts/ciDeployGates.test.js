import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Etapa 8, Fase 4: o primeiro deploy do Retiradas apos a promocao do
// monorepo de 4 apps nao pode acontecer se Finan, ADM ou Operacao
// estiverem invalidos — mesmo que so o Retiradas seja publicado por
// este job (ver docs/runbooks/promocao-monorepo.md). Este teste falha
// se algum desses "needs" for removido no futuro por engano.

function readWorkflow() {
	return fs
		.readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8")
		.replace(/\r\n/g, "\n");
}

function extractJobBlock(workflowText, jobName) {
	const lines = workflowText.split("\n");
	const startIndex = lines.findIndex((line) => line === `  ${jobName}:`);
	assert.ok(startIndex !== -1, `job "${jobName}" nao encontrado em ci.yml`);

	const blockLines = [lines[startIndex]];
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		const line = lines[i];
		// Proximo job top-level comeca com exatamente 2 espacos + nome + ":".
		if (/^  [a-zA-Z0-9_-]+:/.test(line)) break;
		blockLines.push(line);
	}
	return blockLines.join("\n");
}

function extractNeeds(jobBlock) {
	const needsIndex = jobBlock.indexOf("needs:");
	assert.ok(needsIndex !== -1, "job nao tem bloco needs:");

	const afterNeeds = jobBlock.slice(needsIndex + "needs:".length);
	const needsLines = [];
	for (const rawLine of afterNeeds.split("\n").slice(1)) {
		const match = rawLine.match(/^\s{6}-\s*([a-zA-Z0-9_-]+)\s*$/);
		if (!match) break;
		needsLines.push(match[1]);
	}
	return needsLines;
}

test("deploy-vps depende de security, build-and-test e dos 3 validate-* antes de publicar", () => {
	const workflow = readWorkflow();
	const jobBlock = extractJobBlock(workflow, "deploy-vps");
	const needs = extractNeeds(jobBlock);

	const required = [
		"security",
		"build-and-test",
		"validate-finan",
		"validate-adm",
		"validate-operacao",
	];

	for (const requiredJob of required) {
		assert.ok(
			needs.includes(requiredJob),
			`deploy-vps deveria depender de "${requiredJob}", needs atual: [${needs.join(", ")}]`,
		);
	}
});

test("validate-finan, validate-adm e validate-operacao existem como jobs no workflow", () => {
	const workflow = readWorkflow();
	for (const jobName of ["validate-finan", "validate-adm", "validate-operacao"]) {
		assert.match(workflow, new RegExp(`^  ${jobName}:$`, "m"));
	}
});
