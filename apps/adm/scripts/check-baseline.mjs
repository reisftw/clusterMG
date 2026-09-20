import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static inventory only: never imports the application or connects to services.
// Literal imports are inspected heuristically, not with a JavaScript parser.
const admRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = path.resolve(admRoot, "../..");
const relative = (file) => path.relative(admRoot, file).split(path.sep).join("/");
const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

function walk(directory) {
	if (!fs.existsSync(directory)) return [];
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(file) : [file];
	}).sort();
}

function resolveSource(base) {
	return [base, ...[".js", ".jsx", ".mjs", ".cjs", ".json"].map((ext) => base + ext),
		...["index.js", "index.jsx", "index.mjs", "index.cjs"].map((name) => path.join(base, name))]
		.find(isFile);
}

const imports = [];
const sources = ["backend/src", "frontend/src"].flatMap((directory) =>
	walk(path.join(admRoot, directory)).filter((file) => /\.(?:[cm]?js|jsx)$/.test(file)));

for (const file of sources) {
	const source = fs.readFileSync(file, "utf8");
	const literals = /\brequire\(\s*["']([^"']+)["']\s*\)|\bfrom\s+["']([^"']+)["']|\bimport\s*(?:\(\s*)?["']([^"']+)["']/g;
	for (const match of source.matchAll(literals)) {
		const specifier = match[1] || match[2] || match[3];
		if (!specifier.startsWith(".")) continue;
		const target = path.resolve(path.dirname(file), specifier);
		const resolved = resolveSource(target);
		const legacyBase = file.includes(`${path.sep}backend${path.sep}`)
			? path.join(repoRoot, "vps/api/src", path.relative(path.join(admRoot, "backend/src"), target))
			: path.join(repoRoot, "src", path.relative(path.join(admRoot, "frontend/src"), target));
		const legacy = resolveSource(legacyBase);
		imports.push({ source: relative(file), specifier, resolved: resolved ? relative(resolved) : null,
			legacyCandidate: legacy ? path.relative(repoRoot, legacy).split(path.sep).join("/") : null });
	}
}

const requiredPaths = ["backend/src/index.js", "backend/scripts/run-sql-migrations.js",
	"frontend/package.json", "frontend/index.html", "frontend/src/main.jsx"];
const missingPaths = requiredPaths.filter((file) => !isFile(path.join(admRoot, file)));
const missingImports = imports.filter((item) => !item.resolved);
const report = {
	method: "Static literal-import inventory; legacy candidates are path matches, not verified replacements. Does not validate runtime, computed imports, JSX syntax or package exports.",
	sourceFiles: sources.map(relative),
	backendScripts: JSON.parse(fs.readFileSync(path.join(admRoot, "backend/package.json"), "utf8")).scripts,
	missingPaths,
	summary: { sourceFiles: sources.length, relativeImports: imports.length, missingImports: missingImports.length },
	imports,
};
console.log(JSON.stringify(report, null, 2));
if (missingPaths.length || missingImports.length) process.exitCode = 1;
