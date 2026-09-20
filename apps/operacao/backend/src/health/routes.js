const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", async (_req, res) => {
	try {
		await db.query("select 1");
		res.json({ ok: true, status: "ok" });
	} catch {
		res.status(503).json({ ok: false, status: "unavailable" });
	}
});

router.get("/status", async (_req, res) => {
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
		service: "rot-api",
		postgres,
		timestamp: new Date().toISOString(),
	});
});

router.get("/details", async (_req, res) => {
	let postgres = "offline";
	const startedAt = Date.now();
	try {
		await db.query("select 1");
		postgres = "online";
	} catch {
		postgres = "offline";
	}
	const checkedAt = new Date().toISOString();
	const responseMs = Date.now() - startedAt;
	const services = [
		{ id: "database", label: "PostgreSQL Operação", status: postgres, checkedAt, details: { responseMs } },
		{ id: "auth", label: "Login Operação", status: "online", checkedAt, details: { responseMs } },
		{ id: "documents", label: "Documentos Operação", status: postgres, checkedAt, details: { responseMs } },
		{ id: "imports", label: "Importações Operação", status: postgres, checkedAt, details: { responseMs } },
		{ id: "backups", label: "Backups Operação", status: postgres, checkedAt, details: { responseMs } },
		{ id: "realtime", label: "Tempo real Operação", status: "online", checkedAt, details: { responseMs } },
		{ id: "public-data", label: "Dados públicos Operação", status: "online", checkedAt, details: { responseMs } },
		{ id: "sempre-playground", label: "Sempre / Playground", status: "online", checkedAt, details: { responseMs } },
		{ id: "hubsoft", label: "Hubsoft", status: "online", checkedAt, details: { responseMs } },
		{ id: "cvortex", label: "Cvortex", status: "online", checkedAt, details: { responseMs } },
		{ id: "senior", label: "Senior", status: "online", checkedAt, details: { responseMs } },
	];
	res.status(postgres === "online" ? 200 : 503).json({ ok: postgres === "online", services, checkedAt });
});

module.exports = router;
