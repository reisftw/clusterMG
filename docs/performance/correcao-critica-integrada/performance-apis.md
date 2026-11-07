# Performance das APIs

## Baseline informado

| Rota | P95 anterior |
| --- | ---: |
| `POST /api/notifications/read` | 8.247 ms |
| `POST /api/webhooks/evolution` | 9.000 ms |
| Leituras de recuperacao de ativos | 17.497 a 17.553 ms |

## Correcao

- `notifications/read` responde antes da telemetria secundaria de push.
- O webhook Evolution autentica, persiste com deduplicacao e responde; o processamento ocorre em worker duravel.
- Eventos Evolution falhos usam retry exponencial, limite de tentativas e recuperacao de lock abandonado.
- Leituras de recuperacao nao executam conciliacao.
- Busca paginada de tecnicos foi separada das demais chamadas do frontend.

## Pos-deploy

P50, P95, P99, throughput e 5xx serao preenchidos em `resultado-final.md` apenas com amostra observada depois da publicacao.
