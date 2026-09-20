// Roteiro Finan #26: expõe a especificação OpenAPI da API v1 como JSON —
// consumida pela página FinanApiDocsPage.jsx do frontend, que renderiza o
// Swagger UI no navegador (client-side, com o mesmo token Bearer já usado
// em todo o resto do app). Não usamos swagger-ui-express aqui porque ele
// serve uma página HTML por navegação direta, sem jeito de anexar o
// Authorization header do Finan — o app inteiro é SPA com token Bearer em
// localStorage, não cookie de sessão.
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { requireApiV1Permission } = require("../auth");
const { noStore } = require("../../security/noStore");

const router = express.Router();
const SPEC_PATH = path.join(__dirname, "../openapi.yaml");

let cachedSpec = null;
function loadSpec() {
	// Cacheado em memoria — o arquivo so muda em deploy (reinicia o
	// processo), nao faz sentido reler do disco a cada requisicao.
	if (cachedSpec) return cachedSpec;
	cachedSpec = YAML.parse(fs.readFileSync(SPEC_PATH, "utf8"));
	return cachedSpec;
}

router.use(requireApiV1Permission("finan.configuracoes.view"));
router.use(noStore);

router.get("/openapi.json", (_req, res, next) => {
	try {
		res.json(loadSpec());
	} catch (error) {
		next(error);
	}
});

module.exports = router;
