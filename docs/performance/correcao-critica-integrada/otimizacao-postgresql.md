# Otimizacao PostgreSQL

## Alteracoes

- Indice parcial da fila Evolution por proxima tentativa.
- Indice de paginacao de tecnicos da recuperacao.
- Indice de movimentacoes por periodo e status.
- Indice de registros HubSoft por perfil, atividade e data.
- Upsert HubSoft por `jsonb_to_recordset`.
- Atualizacao em lote dos snapshots e insercao em lote das alocacoes.
- Claim do webhook com `FOR UPDATE SKIP LOCKED`.

## Auditoria

Na amostra de producao nao havia conexoes ociosas em transacao, locks relevantes ou saturacao do pool. `pg_stat_statements` nao estava instalado; por isso nao foram inventadas estatisticas SQL por consulta.

A migration `121_integrated_p0_reliability.sql` e aditiva e nao remove dados.
