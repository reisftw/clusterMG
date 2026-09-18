// Roteiro Finan #26: equivalente v1 de /api/finan/health. Publico (sem
// requireFinanAuth), mesmo criterio da rota legada.
const express = require("express");
const db = require("../../db");
const { sendData } = require("../envelope");

const router = express.Router();

router.get("/", async (_req, res) => {
	let postgres = "down";
	try {
		await db.query("select 1");
		postgres = "up";
	} catch {
		postgres = "down";
	}
	const ok = postgres === "up";
	sendData(
		res,
		{ service: "finan-api", postgres, timestamp: new Date().toISOString() },
		{ status: ok ? 200 : 503 },
	);
});

module.exports = router;
