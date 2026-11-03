# Alteracoes da Onda 0.1

- DDL removido do startup; schema volta a ser responsabilidade de migration.
- Migration 113 aditiva, idempotente e protegida por RLS administrativo.
- SQL detalhado recebe redacao de literais e limite de cardinalidade.
- Correlation ID e sempre gerado pelo servidor.
- Erros persistidos somente como classe HTTP ou `query_error`.
- E-mail removido da identificacao de metricas.
- `rawQuery()` mede pool/query e sempre libera a conexao.
- Flush interno nao suspende telemetria de requisicoes concorrentes.
- Coleta detalhada desligada evita normalizacao SQL no caminho comum.
- AutoISP, HubSoft, sincronizacao HubSoft e recuperacao de equipamentos recebem
  agregados de duracao, falha, timeout e volume.
- Painel existente exibe P50/P95/P99, pool, integracoes e jobs.
- CI e release usam PostgreSQL 16 descartavel para validar a migration 113.

Impacto de modulos: Retiradas e infraestrutura de release Retiradas. Mercado e
Operacao nao recebem deploy nem alteracao funcional.

