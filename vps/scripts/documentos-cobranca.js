const documentosService = require("../api/src/documentos/services/documentosService");

function hasArg(name) {
	return process.argv.includes(name);
}

async function main() {
	const result = await documentosService.runBillingNotifications({
		force: hasArg("--force"),
	});
	console.log(JSON.stringify(result));
}

main().catch((error) => {
	console.error("[documentos-cobranca] Falha:", error);
	process.exitCode = 1;
});
