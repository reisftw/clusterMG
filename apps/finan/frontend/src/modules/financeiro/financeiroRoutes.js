import { FINAN_ROUTES } from "../../routes";

// Shim local pro modulo financeiro (portado do Retiradas em 2026-09-07):
// FinanceiroPage.jsx usa `ROUTES.FINANCEIRO_*` como destino de links
// internos (menu/CTAs). Aqui mapeamos só as chaves que o componente
// realmente usa pros paths nativos do Finan (apps/finan/frontend/src/routes.js),
// sem trazer a árvore de rotas inteira do Retiradas.
export const ROUTES = {
	FINANCEIRO_CONTAS_PAGAR: FINAN_ROUTES.CONTAS_PAGAR,
	FINANCEIRO_CONTAS_RECEBER: FINAN_ROUTES.CONTAS_RECEBER,
	FINANCEIRO_FATURAMENTO: FINAN_ROUTES.FATURAMENTO,
	FINANCEIRO_ORCAMENTO_CENTROS_CUSTO: FINAN_ROUTES.ORCAMENTO,
	FINANCEIRO_ORCAMENTO_CONFIGURACOES: FINAN_ROUTES.ORCAMENTO_CONFIGURACOES,
	FINANCEIRO_REPORTS_SERASA: FINAN_ROUTES.REPORTS_SERASA,
};
