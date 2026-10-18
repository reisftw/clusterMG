import fs from "node:fs";
import path from "node:path";

function parseArguments(argv) {
	const options = {};

	for (let index = 2; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];

		if (!key?.startsWith("--") || !value) {
			throw new Error("Use --product, --version, --checksums, and --output.");
		}

		options[key.slice(2)] = value;
	}

	return options;
}

function required(options, name) {
	const value = options[name];
	if (!value) {
		throw new Error(`Missing required argument --${name}.`);
	}
	return value;
}

function parseChecksums(filePath) {
	const entries = fs
		.readFileSync(filePath, "utf8")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
			if (!match) {
				throw new Error(`Invalid SHA-256 entry: ${line}`);
			}

			return { sha256: match[1].toLowerCase(), file: match[2] };
		});

	if (entries.length === 0) {
		throw new Error("The checksum file did not contain any release artifacts.");
	}

	return entries;
}

const options = parseArguments(process.argv);
const product = required(options, "product");
const version = required(options, "version");
const checksumsPath = required(options, "checksums");
const outputPath = required(options, "output");

if (!/^[a-z][a-z0-9-]*$/i.test(product)) {
	throw new Error("Product must contain only letters, numbers, and hyphens.");
}

if (!/^[a-z0-9][a-z0-9._+-]*$/i.test(version)) {
	throw new Error("Release version contains unsupported characters.");
}

const manifest = {
	schemaVersion: 1,
	kind: "release-candidate",
	product,
	version,
	commit: process.env.GITHUB_SHA || null,
	sourceRef: process.env.GITHUB_REF_NAME || null,
	workflowRunId: process.env.GITHUB_RUN_ID || null,
	createdAt: new Date().toISOString(),
	publication: {
		status: "candidate",
		activeRelease: null,
	},
	artifacts: parseChecksums(checksumsPath),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
