# Deploy de producao

## Regra

Esta entrega usa exatamente uma execucao manual do workflow oficial `deploy-retiradas.yml`, depois de CI verde e integracao na `master`.

O workflow preserva:

1. Validacao, lint, testes, contratos e migration tests.
2. Build e empacotamento do mesmo commit verificado.
3. Backup antes da alteracao.
4. Aplicacao de migrations.
5. Troca atomica de frontend e backend.
6. Reinicio do servico e health checks.
7. Rollback automatico em falha.

## Registro

- Branch de trabalho: `codex/p0-correcao-integrada`.
- Commit publicado: `c955bc7df7780c5bb8858f4a778f687b031aeecd`.
- Versao: `v2026.11.07-c955bc7-p0`.
- Workflow: `Prepare Retiradas Release`.
- Run: `#154` (`42332182726`).
- URL: `https://github.com/reisftw/clusterMG/actions/runs/42332182726`.
- Resultado: build, migration e publicacao concluidos com sucesso.
- Regra de deploy: uma unica execucao oficial; nenhum deploy manual ou segunda tentativa.

## Smoke de producao

- `retiradas-api.service`: ativo desde `2026-11-07 03:09:30 UTC`.
- Health check local e publico: aprovado.
- Frontend publicado contem o marcador `c955bc7`.
- Migration `121_integrated_p0_reliability.sql`: registrada no banco de producao.
- Journal do servico desde a publicacao: sem entradas de warning ou error durante o smoke.
