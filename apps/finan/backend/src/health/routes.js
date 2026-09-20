const express = require("express");
const db = require("../db");

const router = express.Router();

// Healthcheck simples: confirma que o processo esta vivo e, com timeout
// curto, que o Postgres responde. Nunca expõe host/porta/DATABASE_URL nem
// stack — so um booleano por dependencia, como recomendado para endpoint
// publico e nao autenticado.
router.get("/", async (_req, res) => {
	let postgres = "down";
	try {
		await db.query("select 1");
		postgres = "up";
	} catch {
		postgres = "down";
	}
	const ok = postgres === "up";
	res.status(ok ? 200 : 503).json({
		ok,
		service: "finan-api",
		postgres,
		timestamp: new Date().toISOString(),
	});
});

module.exports = router;
