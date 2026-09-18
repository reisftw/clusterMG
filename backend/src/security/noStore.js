// Middleware simples: marca a resposta como nao-cacheavel. Usado nas rotas
// que devolvem configuracao/segredo mascarado/log de auditoria — nao faz
// sentido um proxy/navegador guardar isso em cache, mesmo que mascarado.
// Nao aplicado globalmente de proposito (a maioria das rotas do Finan e
// GET simples sem problema nenhum em ficar no cache do navegador local).
function noStore(_req, res, next) {
	res.setHeader("Cache-Control", "no-store");
	next();
}

module.exports = { noStore };
