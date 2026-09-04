const express = require("express");

const router = express.Router();

router.get("/", (_req, res) => {
	res.json({
		ok: true,
		integracoes: [
			{ id: "hubsoft", nome: "Hubsoft", status: "planejado" },
			{ id: "cvortex", nome: "Cvortex", status: "planejado" },
			{ id: "senior", nome: "Senior", status: "planejado" },
			{ id: "playground", nome: "Playground", status: "planejado" },
		],
	});
});

module.exports = router;
