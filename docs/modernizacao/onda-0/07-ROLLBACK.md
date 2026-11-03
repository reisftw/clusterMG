# Rollback

1. Desabilitar `OBSERVABILITY_ENABLED=false` para interromper operacoes e jobs.
2. Manter `METRICS_ENABLED=false` para impedir coleta detalhada.
3. Reimplantar a release anterior pelo workflow Retiradas.
4. Nao remover as colunas/tabela da migration 113; o schema aditivo e inerte
   para a versao anterior.
5. Confirmar `/api/health` e o login apos o rollback.

O workflow de producao preserva backup do backend e release anterior do
frontend. Nenhum rollback destrutivo de banco e necessario.

