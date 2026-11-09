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

test("release workflows are manual and preserve verified artifacts", () => {
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
			/actions\/upload-artifact@(v4|ea165f8d65b6e75b540449e92b4886f43607fa02)/.test(
				workflow,
			),
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

test("Retiradas release has a master-only production adapter with rollback", () => {
	const workflow = readWorkflow("deploy-retiradas.yml");

	for (const required of [
		"github.ref == 'refs/heads/master'",
		"environment: production-retiradas",
		"needs: prepare",
		"Rebuild verified production revision",
		"ops/release-metadata.mjs",
		"sha256sum -c SHA256SUMS.txt",
		"VPS_SSH_KEY",
		"Publish atomically with rollback",
		"PREVIOUS_RELEASE",
		"https://retiradas.tech/api/health",
	]) {
		assert.ok(
			workflow.includes(required),
			"Retiradas production adapter should contain " + required,
		);
	}
});

test("Retiradas can publish the Android build from the same release run", () => {
	const deploy = readWorkflow("deploy-retiradas.yml");
	const android = readWorkflow("publish-retiradas-android.yml");

	assert.ok(deploy.includes("publish_android:"));
	assert.ok(deploy.includes("uses: ./.github/workflows/publish-retiradas-android.yml"));
	assert.ok(deploy.includes("needs: [prepare, publish]"));
	assert.match(android, /^  workflow_call:/m);
});

test("Mercado and Operacao release workflows remain artifact-only", () => {
	for (const workflowName of ["deploy-mercado.yml", "deploy-operacao.yml"]) {
		const workflow = readWorkflow(workflowName);
		assert.ok(
			!workflow.includes("ssh "),
			workflowName + " must remain artifact-only",
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
		"gitleaks/gitleaks-action@dcedce43c6f43de0b836d1fe38946645c9c638dc",
	]) {
		assert.ok(
			workflow.includes(required),
			"security workflow should contain " + required,
		);
	}
});

test("Retiradas workflows pin third-party actions and the production SSH host", () => {
	for (const workflowName of [
		"ci-retiradas.yml",
		"deploy-retiradas.yml",
		"security.yml",
	]) {
		const workflow = readWorkflow(workflowName);
		assert.doesNotMatch(
			workflow,
			/uses:\s+[^\s]+@(v\d+|master|main)\b/,
			workflowName + " must pin actions to immutable revisions",
		);
	}

	const deploy = readWorkflow("deploy-retiradas.yml");
	assert.ok(!deploy.includes("ssh-keyscan"));
	assert.ok(deploy.includes(".github/known_hosts/retiradas"));
	assert.ok(deploy.includes("StrictHostKeyChecking=yes"));
	assert.ok(deploy.includes("HostKeyAlias=retiradas-production"));
});

test("secret scan runs for every protected change and baselines only exact historical findings", () => {
	const workflow = readWorkflow("security.yml");
	const baseline = fs.readFileSync(
		path.join(process.cwd(), ".gitleaksignore"),
		"utf8",
	);
	assert.doesNotMatch(workflow, /^\s+paths:/m);
	assert.ok(!baseline.includes("*"));
	const fingerprints = baseline
		.split(/\r?\n/)
		.filter((line) => line && !line.startsWith("#"));
	assert.equal(fingerprints.length, 13);
	assert.equal(new Set(fingerprints).size, fingerprints.length);
});
