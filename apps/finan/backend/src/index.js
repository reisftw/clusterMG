const { createApp } = require("./app");
const db = require("./db");

const port = Number(process.env.FINAN_API_PORT || process.env.PORT || 3101);
const app = createApp();

const server = app.listen(port, () => {
	console.log(`[finan-api] ouvindo em http://127.0.0.1:${port}`);
});

async function shutdown(signal) {
	console.log(`[finan-api] encerrando por ${signal}...`);
	server.close(async () => {
		await db.closePool().catch(() => {});
		process.exit(0);
	});
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
