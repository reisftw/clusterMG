import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readWorkflow(name) {
	return fs
		.readFileSync(path.join(process.cwd(), ".github", "workflows", name), "utf8")
		.replace(/\r\n/g, "\n");
}

test("CI is split by Retiradas, Mercado, and Operacao ownership", () => {
	const expected = [
		["ci-retiradas.yml", "apps/retiradas/**"],
		["ci-mercado.yml", "apps/retiradas/frontend/src/modules/mercado/**"],
		["ci-operacao.yml", "apps/operacao/**"],
	];

	for (const [workflowName, expectedPath] of expected) {
		const workflow = readWorkflow(workflowName);
		assert.match(workflow, /^on:/m);
		assert.ok(
			workflow.includes(expectedPath),
			workflowName + " should be scoped to " + expectedPath,
		);
		assert.ok(
			workflow.includes("workflow_dispatch:"),
			workflowName + " should support a manual validation run",
		);
	}
});

test("Mercado CI retains Retiradas compatibility and privacy validation", () => {
	const workflow = readWorkflow("ci-mercado.yml");

	for (const required of [
		"npm run lint:retiradas",
		"npm run test:retiradas",
		"progressivePrivacy.test.js",
		"npm run build:retiradas",
	]) {
		assert.ok(
			workflow.includes(required),
			"Mercado CI should retain " + required,
		);
	}
});

test("release workflows are manual and do not contain remote deployment commands", () => {
	for (const workflowName of [
		"deploy-retiradas.yml",
		"deploy-mercado.yml",
		"deploy-operacao.yml",
	]) {
		const workflow = readWorkflow(workflowName);

		assert.match(workflow, /^  workflow_dispatch:/m);
		assert.ok(
			!workflow.includes("\n  push:"),
			workflowName + " must not deploy on push",
		);
		assert.ok(
			!workflow.includes("ssh "),
			workflowName + " must not invoke SSH yet",
		);
		assert.ok(
			workflow.includes("actions/upload-artifact@v4"),
			workflowName + " should preserve a verified release artifact",
		);
		assert.ok(
			workflow.includes("release_version:"),
			workflowName + " should require a release version",
		);
		assert.ok(
			workflow.includes("ops/release-metadata.mjs"),
			workflowName + " should generate release metadata",
		);
		assert.ok(
			workflow.includes("release-manifest.json"),
			workflowName + " should upload the release manifest",
		);
		assert.ok(
			workflow.includes("concurrency:"),
			workflowName + " should serialize release preparation",
		);
	}
});

test("security workflow audits dependency projects and scans for secrets", () => {
	const workflow = readWorkflow("security.yml");

	for (const required of [
		"apps/retiradas/backend",
		"apps/operacao/frontend",
		"apps/operacao/backend",
		"npm audit",
		"gitleaks/gitleaks-action@v2",
	]) {
		assert.ok(
			workflow.includes(required),
			"security workflow should contain " + required,
		);
	}
});
