const path = require("node:path");
const service = require("../api/src/mobileAppDistributionService");

function argument(name, fallback = "") {
	const prefix = `--${name}=`;
	const value = process.argv.find((item) => item.startsWith(prefix));
	return value ? value.slice(prefix.length) : fallback;
}

async function main() {
	const filePath = path.resolve(argument("file"));
	const versionName = argument("version");
	const versionCode = argument("version-code");
	if (!argument("file") || !versionName) {
		throw new Error("Use --file=/caminho/app.apk --version=1.0.0 [--version-code=1].");
	}
	const release = await service.publishApk({
		filePath,
		originalName: path.basename(filePath),
		versionName,
		versionCode,
		notes: argument("notes", "Publicacao automatizada pelo pipeline Android."),
		user: { id: "github-actions", name: "GitHub Actions" },
	});
	console.log(JSON.stringify({ ok: true, release }, null, 2));
}

main().catch((error) => {
	console.error(error?.message || error);
	process.exit(1);
});
