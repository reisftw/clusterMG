import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const metadataScript = path.join(process.cwd(), "ops", "release-metadata.mjs");
const sha256 = "a".repeat(64);

test("release metadata records module, revision, and verified artifacts", (t) => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cluster-release-"));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

	const checksums = path.join(directory, "SHA256SUMS.txt");
	const output = path.join(directory, "release-manifest.json");
	fs.writeFileSync(checksums, `${sha256}  mercado-frontend.tar.gz\n`);

	const result = spawnSync(
		process.execPath,
		[
			metadataScript,
			"--product",
			"mercado",
			"--version",
			"v1.2.3",
			"--checksums",
			checksums,
			"--output",
			output,
		],
		{
			cwd: directory,
			env: {
				...process.env,
				GITHUB_REF_NAME: "mercado",
				GITHUB_RUN_ID: "123",
				GITHUB_SHA: "abcdef123456",
			},
		},
	);

	assert.equal(result.status, 0, result.stderr.toString());

	const manifest = JSON.parse(fs.readFileSync(output, "utf8"));
	assert.deepEqual(manifest, {
		schemaVersion: 1,
		kind: "release-candidate",
		product: "mercado",
		version: "v1.2.3",
		commit: "abcdef123456",
		sourceRef: "mercado",
		workflowRunId: "123",
		createdAt: manifest.createdAt,
		publication: {
			status: "candidate",
			activeRelease: null,
		},
		artifacts: [{ sha256, file: "mercado-frontend.tar.gz" }],
	});
	assert.ok(!Number.isNaN(Date.parse(manifest.createdAt)));
});

test("release metadata rejects an unsafe version", () => {
	const result = spawnSync(process.execPath, [
		metadataScript,
		"--product",
		"retiradas",
		"--version",
		"v1.0.0;unsafe",
		"--checksums",
		"missing.txt",
		"--output",
		"missing.json",
	]);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr.toString(), /unsupported characters/i);
});
