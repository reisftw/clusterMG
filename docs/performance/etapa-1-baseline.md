# Etapa 1 - Baseline de performance

## Escopo e fonte

Baseline coletado em 2026-11-03, sem teste de carga e sem escrita em producao.
As fontes foram:

- agregados de `maintenance_route_metrics_hourly` nas 24 horas anteriores;
- agregados de operacoes da Onda 0 desde a aplicacao da migration 113, em
  2026-11-03 10:00:27 UTC;
- `EXPLAIN (ANALYZE, BUFFERS)` apenas para consultas SELECT limitadas;
- tres requisicoes HTTP sequenciais ao resumo publico;
- inspecao estatica do commit base `9c0454f`.

Os percentis abaixo sao aproximacoes pelo limite superior dos buckets de
latencia (50, 100, 250, 500, 1000, 2500 e 5000 ms). Eles nao possuem a precisao
de amostras individuais. `metrics_requests` e `metrics_queries` detalhadas estao
desabilitadas em producao, portanto nao ha percentil SQL por fingerprint.

## Visao geral - 24 horas

| Metrica | Valor medido |
|---|---:|
| Requisicoes | 21.398 |
| Throughput medio | 14,86 requisicoes/minuto |
| Respostas 4xx | 294 |
| Respostas 5xx | 0 |
| Latencia media global | 215,75 ms |
| Maior latencia observada | 36.019,20 ms |
| Consultas SQL associadas | 125.528 |

## Endpoints prioritarios - 24 horas

| Endpoint | Chamadas | Media | P50 aprox. | P95 aprox. | P99 aprox. | Maximo | SQL/chamada |
|---|---:|---:|---:|---:|---:|---:|---:|
| `GET /api/acompanhamento/resumo` | 2.474 | 523,85 ms | <=100 ms | <=2.500 ms | <=5.000 ms | 5.174,28 ms | 1,57 |
| `GET /api/agendamentos/` | 3.127 | 150,59 ms | <=250 ms | <=500 ms | <=1.000 ms | 1.863,75 ms | 2,04 |
| `GET /api/documents` | 3.167 | 102,82 ms | <=50 ms | <=500 ms | <=1.000 ms | 8.830,06 ms | 2,59 |
| `GET /api/integrations/sempre/equipment/serial` | 0 | nao medido | nao medido | nao medido | nao medido | nao medido | nao medido |

Nao houve erro 4xx ou 5xx nos tres endpoints com amostra. A rota de serial nao
teve amostra agregada na janela e nao recebeu numero inventado.

## Resumo publico

A resposta medida possui 463.588 bytes. Em tres chamadas sequenciais externas:

| Estado | Tempo total | TTFB |
|---|---:|---:|
| MISS | 2,002 s | 1,952 s |
| HIT | 0,121 s | 0,072 s |
| HIT | 0,151 s | 0,105 s |

O backend informou `X-Cache-Status: HIT` e idade de cache. O cache de 60 segundos
e o compartilhamento de build concorrente ja existiam antes da Etapa 1.

## PostgreSQL

- `agendamentos`: 606 linhas estimadas, 23 mortas.
- `app_documents`: 90.818 linhas estimadas, 17 mortas.
- listagem completa de agendamentos: 2,249 ms, sort em memoria de 1.237 kB.
- agendamentos do dia: 0,062 ms usando `agendamentos_data_status_idx`.
- `acompanhamento_diario` (307 linhas): 2,137 ms.
- `visitas` (385 linhas, cache frio no teste): 36,230 ms.

Esses planos nao sustentam a criacao imediata de novo indice. A maior parte da
latencia dos endpoints inclui autenticacao/RBAC, transacao de contexto RLS,
serializacao, rede e demais consultas do request.

## Operacoes da Onda 0

Janela disponivel desde a migration 113:

| Operacao | Chamadas | Media | Maximo | Consultas SQL | Itens processados |
|---|---:|---:|---:|---:|---:|
| HubSoft `MATCH` | 6 | 219.983,62 ms | 261.981,97 ms | 239.367 | 103.314 |
| HubSoft `MAPA` | 6 | 146.741,48 ms | 159.395,54 ms | 94.947 | 92.940 |
| PostgreSQL `rls_transaction` | 32.198 | 77,03 ms | 213.220,02 ms | n/a | n/a |
| PostgreSQL `pool_wait` | 371.884 | 1,02 ms | 1.740,05 ms | n/a | n/a |

Nao houve timeout registrado no pool nessa janela. Os jobs MATCH e MAPA sao os
maiores consumidores medidos, mas foram mantidos fora da alteracao pequena desta
etapa para evitar misturar uma mudanca de importacao em tempo real com os quatro
endpoints prioritarios.
