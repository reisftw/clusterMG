const { createApp } = require("./app");
const db = require("./db");
const apiStatus = require("./apiStatus");
const { closeRealtimeClients } = require("./realtime");

const port = Number(process.env.ADM_API_PORT || process.env.PORT || 3301);
const app = createApp();

function safeErrorForLog(error) {
	if (!error || typeof error !== "object") return error;
	return {
		name: error.name,
		message: error.message,
		code: error.code,
		status: error.status || error.statusCode,
		stack: error.stack,
	};
}

const server = app.listen(port, () => {
	console.log(`[adm-api] ouvindo em http://127.0.0.1:${port}`);
	apiStatus.recordRuntimeEvent("startup", {
		port,
		reason: "process_started",
	});
});

let shuttingDown = false;

async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[adm-api] Encerrando por ${signal}...`);
	closeRealtimeClients();

	const forceExit = setTimeout(() => {
		console.error("[adm-api] Encerramento excedeu 10s. Forcando saida.");
		process.exit(1);
	}, 10000);
	forceExit.unref?.();

	try {
		await apiStatus.recordRuntimeEvent("shutdown", {
			signal,
			reason: "process_signal",
		});
	} catch (error) {
		console.warn(
			"[adm-api] Falha ao registrar evento de shutdown:",
			error?.message || error,
		);
	}

	server.close(async () => {
		await db.closePool().catch(() => {});
		clearTimeout(forceExit);
		process.exit(0);
	});
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", async (error) => {
	console.error("[adm-api] uncaughtException:", safeErrorForLog(error));
	await apiStatus.recordRuntimeEvent("uncaughtException", {
		reason: error?.message || "uncaughtException",
		stack: String(error?.stack || "").slice(0, 4000),
	});
	process.exit(1);
});
process.on("unhandledRejection", async (reason) => {
	console.error("[adm-api] unhandledRejection:", safeErrorForLog(reason));
	await apiStatus.recordRuntimeEvent("unhandledRejection", {
		reason: reason?.message || String(reason || "unhandledRejection"),
		stack: String(reason?.stack || "").slice(0, 4000),
	});
});
