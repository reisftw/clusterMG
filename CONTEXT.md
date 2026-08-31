# Contexto do Projeto

## Financeiro

- O conceito de demonstrativo financeiro concentra regras de DRE, importacao de planilhas, periodos, agrupamentos e totais seguros para exibicao.
- A interface backend inicial fica em `vps/api/src/financeiroStatement.js` e deve crescer como ponto de entrada para regras de demonstrativo, em vez de espalhar filtros e calculos entre controller, repository e tela.
- A interface frontend inicial fica em `src/modules/financeiro/domain/financialStatement.js` e deve receber regras puras de montagem de view model/importacao antes que elas cheguem aos componentes React.
- `FinanceiroPage.jsx` e componentes filhos devem orquestrar telas e chamadas, nao duplicar matematica de DRE ou parsing de importacao quando houver funcao de dominio disponivel.
