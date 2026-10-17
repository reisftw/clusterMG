const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const apiRoot = path.join(root, "apps", "retiradas", "backend", "api", "src");
const outputDir = path.join(root, "docs", "release");
const outputFile = path.join(outputDir, "retiradas-endpoint-inventory.json");
const appFile = path.join(apiRoot, "app.js");
const routeCall = /\b(app|router)\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\3/g;

function walk(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return walk(fullPath);
		return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
	});
}

function lineAt(source, index) {
	return source.slice(0, index).split("\n").length;
}

function callSource(source, startIndex) {
	const openIndex = source.indexOf("(", startIndex);
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index];
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (["'", '"', "`"].includes(char)) {
			quote = char;
			continue;
		}
		if (char === "(") depth += 1;
		if (char === ")") depth -= 1;
		if (depth === 0) return source.slice(startIndex, index + 1);
	}
	return source.slice(startIndex);
}

function makeGuardMap(source) {
	const guards = new Map();
	for (const match of source.matchAll(
		/const\s+(require\w+)\s*=\s*require(AnyPermission|Roles)\s*\(/g,
	)) {
		guards.set(match[1], match[2] === "Roles" ? "role" : "permission");
	}
	for (const match of source.matchAll(/const\s+(\w+)\s*=\s*\[([\s\S]*?)\];/g)) {
		const gate = match[2].includes("requireAnyPermission")
			? "permission"
			: match[2].includes("requireRoles")
				? "role"
				: null;
		if (gate) guards.set(match[1], gate);
	}
	return guards;
}

function gateFor(source, callIndex, call, guards) {
	const before = source.slice(0, callIndex);
	const fileHasAuthenticatedRouter = /router\.use\(requireAuthenticated\)/.test(
		before,
	);
	const gates = [];
	if (fileHasAuthenticatedRouter || call.includes("requireAuthenticated")) {
		gates.push("authenticated");
	}
	if (call.includes("requireAnyPermission")) gates.push("permission");
	if (call.includes("requireRoles")) gates.push("role");
	if (call.includes("requireCsrfToken")) gates.push("csrf");
	for (const [guard, gate] of guards) {
		if (!new RegExp(`\\b${guard}\\b`).test(call)) continue;
		gates.push(gate);
		const arrayDefinition = new RegExp(
			`const\\s+${guard}\\s*=\\s*\\[([\\s\\S]*?)\\];`,
		).exec(source)?.[1];
		if (arrayDefinition?.includes("requireAuthenticated")) {
			gates.push("authenticated");
		}
	}
	return gates.length ? [...new Set(gates)] : ["public-or-custom"];
}

function resolveRequiredModule(fromFile, request) {
	const absolute = path.resolve(path.dirname(fromFile), request);
	const candidates = [absolute, `${absolute}.js`, path.join(absolute, "index.js")];
	return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function routerMounts() {
	const source = fs.readFileSync(appFile, "utf8");
	const requiredModules = new Map();
	for (const match of source.matchAll(
		/const\s+(?:\{\s*)?(\w+)(?:\s*\})?\s*=\s*require\((['"])(\.\/[^'"]+)\2\)/g,
	)) {
		const moduleFile = resolveRequiredModule(appFile, match[3]);
		if (moduleFile) requiredModules.set(match[1], moduleFile);
	}

	const mounts = new Map();
	for (const match of source.matchAll(
		/app\.use\(\s*(["'])(\/api[^"']*)\1\s*,\s*(\w+)\s*\(/g,
	)) {
		const moduleFile = requiredModules.get(match[3]);
		if (!moduleFile) continue;
		const key = path.relative(root, moduleFile).replaceAll("\\", "/");
		const values = mounts.get(key) || [];
		values.push(match[2]);
		mounts.set(key, values);
	}
	return mounts;
}

function joinRoute(mountPath, localPath) {
	if (!mountPath) return localPath;
	if (localPath === "/") return mountPath;
	return `${mountPath.replace(/\/$/, "")}/${localPath.replace(/^\//, "")}`;
}

const mounts = routerMounts();
const entries = walk(apiRoot)
	.flatMap((file) => {
		const source = fs.readFileSync(file, "utf8");
		const guards = makeGuardMap(source);
		const relativeFile = path.relative(root, file).replaceAll("\\", "/");
		const routeMounts = mounts.get(relativeFile) || [];
		const rows = [];
		for (const match of source.matchAll(routeCall)) {
			const call = callSource(source, match.index);
			const localPath = match[4];
			const mountPaths = routeMounts.length ? routeMounts : [null];
			for (const mountPath of mountPaths) {
				rows.push({
					method: match[2].toUpperCase(),
					path: joinRoute(mountPath, localPath),
					localPath,
					mountPath,
					file: relativeFile,
					line: lineAt(source, match.index),
					gates: gateFor(source, match.index, call, guards),
				});
			}
		}
		return rows;
	})
	.sort((left, right) =>
		`${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`),
	);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
	outputFile,
	`${JSON.stringify(
		{
			generatedBy: "scripts/audit-retiradas-endpoints.cjs",
			entryCount: entries.length,
			entries,
		},
		null,
		2,
	)}\n`,
);

console.log(`Generated ${entries.length} endpoint entries at ${path.relative(root, outputFile)}.`);
