# Etapa 2 - Baseline

## Escopo e estado publicado

Coleta realizada em 2026-11-03 com a producao ainda no commit `9c0454f`.
O commit `412eb7f` da Etapa 1 nao estava publicado e foi usado como base desta
branch. A coleta usou apenas consultas de diagnostico, transacoes `READ ONLY` e
`EXPLAIN (ANALYZE, BUFFERS)` em `SELECT` com timeout.

## PostgreSQL

- Versao: PostgreSQL 16.15.
- Banco: 7.269 MB.
- Limite de conexoes: 100.
- Pool da API: maximo 10, aquisicao 5 s, ociosidade 30 s.
- Espera do pool em 24 h: 420.629 amostras, media 0,95 ms, maximo 1.740 ms,
  nenhum timeout.
- Sessoes na amostra: 1 ativa, 10 ociosas, nenhuma transacao ociosa e nenhum
  lock em espera.
- `pg_stat_statements`: nao instalado. O PostgreSQL nao foi reiniciado para
  ativa-lo.

Maiores relacoes:

| Relacao | Tamanho total | Observacao |
|---|---:|---|
| `audit_logs` | 5.147 MB | 5.077 MB em TOAST; retencao precisa de decisao separada |
| `app_documents` | 290 MB | 109.842 linhas vivas |
| `hubsoft_sync_records` | 267 MB | 122.849 vivas, 17.316 mortas |
| `tentativas_opportunities` | 249 MB | 22.757 linhas |
| `ordens_servico` | 243 MB | 54.418 linhas |
| `app_sessions` | 224 MB | 625.605 linhas vivas |

Pressao de varredura acumulada:

| Relacao | Seq scans | Linhas lidas por seq scan |
|---|---:|---:|
| `tentativas_opportunities` | 11.111.968 | 221.694.019.070 |
| `maps_geocode_cache` | 278.124 | 4.400 milhoes |
| `hubsoft_sync_records` | 43.969 | 3.650 milhoes |
| `mensageria_historico` | 762.550 | 2.670 milhoes |
| `maps_geocode_jobs` | 76.154 | 2.080 milhoes |
| `mensageria_callbacks` | 758.601 | 1.150 milhoes |

## APIs nas ultimas 24 horas

| Endpoint | Chamadas | Media | Maximo | SQL/chamada |
|---|---:|---:|---:|---:|
| `GET /api/acompanhamento/resumo` | 2.656 | 529,58 ms | 7.051 ms | 1,62 |
| `GET /api/acompanhamento/operational-summary` | 1.731 | 350,58 ms | nao comparavel | 15,57 |
| `GET /api/agendamentos/` | 3.326 | 150,28 ms | nao comparavel | 2,07 |
| `GET /api/documents` | 3.367 | 101,97 ms | nao comparavel | 2,68 |
| `GET /api/public/dashboard` | 2.283 | 419,44 ms | nao comparavel | nao informado |

Nao houve amostra suficiente para a rota de serial. A Etapa 1 trata sua
concorrencia e timeout sem inventar um ganho numerico.

## Jobs e consultas criticas

- HubSoft MATCH: 7 execucoes, media 223,7 s, 273.093 consultas.
- HubSoft MAPA: 6 execucoes, media 146,7 s, 94.947 consultas.
- Distribuicao de Tentativas: 3.760,8 ms, 7.348.870 linhas removidas pelo
  filtro do join.
- Fila de geocodificacao: 29,2 ms e varredura da relacao inteira.
- Busca de `maps_geocode_jobs.address_hash`: 15,1 ms e varredura inteira.

Jobs MATCH e MAPA foram diagnosticados, mas nao alterados nesta etapa: mudar
seu processamento exige uma entrega isolada para nao misturar sincronizacao de
dados em tempo real com ajustes SQL locais.
