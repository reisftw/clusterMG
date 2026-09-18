const { createApp } = require("./app");
const db = require("./db");

const port = Number(process.env.ROT_API_PORT || process.env.PORT || 3201);
const host = process.env.ROT_API_HOST || process.env.HOST || "127.0.0.1";
const app = createApp();

const server = app.listen(port, host, () => {
	console.log(`[rot-api] ouvindo em http://${host}:${port}`);
});

async function shutdown(signal) {
	console.log(`[rot-api] encerrando por ${signal}...`);
	server.close(async () => {
		await db.closePool().catch(() => {});
		process.exit(0);
	});
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
