# Contexto do Projeto

## Financeiro

- O conceito de demonstrativo financeiro concentra regras de DRE, importacao de planilhas, periodos, agrupamentos, orcado x realizado, Serasa/Tarifas e totais seguros para exibicao.
- A interface backend fica em `apps/retiradas/backend/api/src/financeiroStatement.js` e e o ponto de entrada para DRE, Serasa, Tarifas e configuracao/dados de orcamento antes de delegar para os repositories normalizados.
- A interface frontend fica em `src/modules/financeiro/domain/financialStatement.js` e e o ponto de entrada para regras puras de DRE, budget insights e view models de tarifas antes que elas cheguem aos componentes React.
- `FinanceiroPage.jsx` e componentes filhos devem orquestrar telas e chamadas, nao duplicar matematica de DRE, budget, tarifas ou parsing de importacao quando houver funcao de dominio disponivel.
