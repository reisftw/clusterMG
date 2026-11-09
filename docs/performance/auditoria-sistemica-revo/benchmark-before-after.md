# Benchmark antes e depois

## Baseline comparável

Baseline de 24 h de 2026-11-03, coletado sem carga destrutiva:

| Endpoint | Chamadas | Média | P50 aprox. | P95 aprox. | P99 aprox. | SQL/chamada |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/api/acompanhamento/resumo` | 2.474 | 523,85 ms | <=100 ms | <=2.500 ms | <=5.000 ms | 1,57 |
| `/api/agendamentos/` | 3.127 | 150,59 ms | <=250 ms | <=500 ms | <=1.000 ms | 2,04 |
| `/api/documents` | 3.167 | 102,82 ms | <=50 ms | <=500 ms | <=1.000 ms | 2,59 |

Na coleta pré-deploy mais recente, `/api/acompanhamento/operational-summary` apresentou 1.517 acessos, média 180,38 ms e 29.961 consultas SQL. MAPA teve 67 execuções/49 falhas; MATCH 61/42.

## Prova local

Os testes demonstram uma única carga para chamadas concorrentes, retorno imediato do snapshot vencido, preservação do último snapshot após falha e restauração do modo bloqueante por configuração. Isso prova comportamento, não substitui a métrica real.

## Pós-deploy

Preencher somente após uma janela equivalente: P50/P95/P99, 5xx, SQL/chamada, espera do pool e chamadas/falhas HubSoft. Não há números posteriores estimados neste documento.
