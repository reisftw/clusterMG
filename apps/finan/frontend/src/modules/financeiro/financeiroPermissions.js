// Shim local pro modulo financeiro (portado do Retiradas em 2026-09-07).
// FinanceiroPage.jsx so usa hasPermission(currentUser, "financeiro.X.manage")
// pra checar 3 permissoes de gerenciamento (configuracoes/gestao_orcamento/
// equipe) contra o array `currentUser.permissions` — que ja vem
// completamente resolvido (com "*" pros admins e os `financeiro.*.manage`
// certos por role) de FinanFinanceiroPage.jsx (buildFinanceiroUser).
// Não precisa da maquina de catalogo/alias legado de
// src/constants/roles.js do Retiradas pra esses 3 pontos de checagem.
export function hasPermission(user, permission) {
	if (!permission || !user) return false;
	const permissions = user.permissions || [];
	if (permissions.includes("*")) return true;
	return permissions.includes(permission);
}
