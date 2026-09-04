const express = require("express");
const { requireFinanPermission } = require("../auth/middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.configuracoes.view"));

router.get("/", (_req, res) => {
	res.json({
		ok: true,
		settings: {
			email: {
				mode: "retiradas-email-temporario",
				from: process.env.FINAN_EMAIL_FROM || "",
			},
		},
	});
});

module.exports = router;
