# Etapa 2 - PostgreSQL

## Diagnostico

O pool nao apresenta exaustao, vazamento ou fila relevante. Aumentar o limite
de 10 conexoes apenas elevaria a concorrencia sobre o banco sem atacar o custo
das consultas. Nenhum ajuste de pool foi feito.

Os parametros `shared_buffers=128MB`, `work_mem=4MB`,
`effective_cache_size=4GB`, `random_page_cost=4` e
`effective_io_concurrency=1` foram registrados. Eles nao foram modificados sem
benchmark controlado e janela de manutencao.

Nao havia indices invalidos antes da alteracao. A pipeline passa a falhar se
uma migration concorrente deixar indice invalido.

## Mudancas

Foram adicionados seis indices B-tree orientados a consultas medidas:

1. `maps_geocode_jobs(address_hash)` para propagacao de resultado por endereco.
2. `maps_geocode_cache(created_at)` parcial para itens `PENDING` e `RETRY`.
3. `mensageria_historico(os)` para reaproveitamento de telefone por O.S.
4. `mensageria_historico(codigo_cliente)` para reaproveitamento por cliente.
5. `mensageria_callbacks(os)` para reaproveitamento de telefone por O.S.
6. `mensageria_callbacks(codigo_cliente)` para reaproveitamento por cliente.

Cada indice e criado com `CONCURRENTLY IF NOT EXISTS`, `lock_timeout=5s` e
`statement_timeout=15min`. Cada arquivo contem um unico indice, permitindo
reexecucao segura depois de interrupcao parcial.

## Itens mantidos fora do escopo

- Nenhuma linha foi apagada de `audit_logs` ou `app_sessions`.
- Nenhum `VACUUM FULL`, `REINDEX`, alteracao de ownership ou reinicio do banco.
- `pg_stat_statements` nao foi ativado porque exigiria configuracao e possivel
  reinicio do PostgreSQL.
- Nenhum indice foi criado para consultas cujo plano atual ja era adequado,
  como a listagem de agendamentos e os documentos prioritarios.
