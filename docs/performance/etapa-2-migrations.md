# Etapa 2 - Migrations

## Arquivos

| Versao | Indice | Evidencia |
|---|---|---|
| 114 | `maps_geocode_jobs_address_hash_idx` | busca por hash fazia seq scan de 15.447 linhas |
| 115 | `maps_geocode_cache_ready_idx` | fila fazia seq scan e sort de 16.154 linhas |
| 116 | `mensageria_historico_os_idx` | enriquecimento por O.S. varria o historico |
| 117 | `mensageria_historico_codigo_cliente_idx` | enriquecimento por cliente varria o historico |
| 118 | `mensageria_callbacks_os_idx` | enriquecimento por O.S. varria callbacks |
| 119 | `mensageria_callbacks_codigo_cliente_idx` | enriquecimento por cliente varria callbacks |

## Execucao segura

- Todas sao aditivas e idempotentes.
- Nao alteram dados, constraints ou ownership.
- Usam `CREATE INDEX CONCURRENTLY` fora de transacao.
- O runner reconhece `-- migration:no-transaction`.
- Lock timeout: 5 segundos.
- Statement timeout: 15 minutos.
- Em falha depois da criacao e antes do registro, a reexecucao usa
  `IF NOT EXISTS` e completa `schema_migrations`.
- O release valida que nao restou indice `public` invalido.

O teste de integracao cria tabelas descartaveis no PostgreSQL 16 do CI, aplica
cada migration duas vezes pelo runner real e verifica os seis indices.

## Backup

Antes de `migrate:sql`, o workflow executa preflight, cria `pg_dump` em formato
custom, valida o arquivo com `pg_restore --list` e somente entao prossegue. O
backup fica em `/opt/retiradas/database-backups` com permissao 0600 e retencao
de 30 dias.
