// Roteiro Finan #26: equivalente v1 de /api/finan/qualidade-dados.
const express = require("express");
const { requireApiV1Permission } = require("../auth");
const { noStore } = require("../../security/noStore");
const { getQualidadeDados } = require("../../qualidadeDados/service");
const { sendData } = require("../envelope");

const router = express.Router();

router.use(requireApiV1Permission("finan.qualidade_dados.view"));
router.use(noStore);

router.get("/", async (_req, res, next) => {
	try {
		sendData(res, await getQualidadeDados());
	} catch (error) {
		next(error);
	}
});

module.exports = router;
