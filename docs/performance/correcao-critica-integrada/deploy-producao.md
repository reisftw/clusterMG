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
- Commit publicado: pendente.
- Workflow e run ID: pendente.
- Horario: pendente.
- Resultado: pendente.
