# Etapa 2 - Producao

## Estado inicial

- Versao observada: `9c0454f`.
- Etapa 1 `412eb7f`: nao publicada.
- Branch de trabalho: `codex/performance-etapa-2`.
- Etapa 2 inclui a Etapa 1, mantendo a ordem no historico Git.

## Processo autorizado

1. Validar toda a branch.
2. Publicar a branch e aguardar CI verde.
3. Integrar em `master` sem force-push.
4. Executar o workflow manual `Prepare Retiradas Release`.
5. Criar e validar backup antes das migrations.
6. Aplicar migrations 114-119.
7. Publicar backend e frontend pelo workflow existente.
8. Executar healthcheck e smoke tests.

## Impacto de modulos

A mudanca atinge apenas Retiradas e o workflow compartilhado de release do
Retiradas. Mercado e Operacao nao sao publicados nem recebem alteracao de
codigo. ADM e Financeiro permanecem fora do escopo.

## Resultado

Pendente de CI e publicacao. Este campo deve ser atualizado somente com o ID do
workflow, commit e versao realmente observados em producao.
