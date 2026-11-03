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

- PR integrado: `#1`.
- Commit publicado: `c172d2d0de0d4a40080edfd877ca9a190d90d2ff`.
- Workflow: `41690131884`.
- Versao: `v2026.11.03-performance-etapa2`.
- Frontend ativo em:
  `/var/www/retiradas/releases/v2026.11.03-performance-etapa2-c172d2d/dist`.
- Backend e Nginx: ativos.
- Migrations aplicadas: 114, 115, 116, 117, 118 e 119.
- Backup anterior as migrations:
  `/opt/retiradas/database-backups/v2026.11.03-performance-etapa2-c172d2d.dump`.
- Backup validado e com 356.764.046 bytes.
- Rollback da aplicacao preservado em `/opt/retiradas/backend-rollbacks` e no
  ponteiro `PREVIOUS_RELEASE` da release do frontend.
- Mercado, Operacao, ADM e Financeiro nao foram publicados.

O pipeline terminou com sucesso e a verificacao independente confirmou health
interno e HTTPS, versao incorporada no bundle, indices validos, ausencia de
locks e ausencia de erros novos no journal do servico.
