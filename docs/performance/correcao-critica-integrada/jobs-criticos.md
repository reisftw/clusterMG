# Jobs criticos HubSoft

## MAPA e MATCH

- Retry por pagina com backoff exponencial e jitter.
- Retry da execucao com backoff exponencial, jitter e teto de cinco minutos.
- Locks existentes e watchdog continuam impedindo sobreposicao.
- Checkpoint de etapa, pagina e lote persistido em `hubsoft_sync_runs`.
- Upsert em lotes configuraveis, padrao 500 e limite 1.000.
- Linhas inalteradas nao sao regravadas.
- Desativacao de registros ocorre somente depois da coleta completa validada.
- Execucoes incompletas, suspeitas ou com falha sao retomadas por nova tentativa idempotente.

## Expectativa tecnica

Uma coleta de 17 mil registros deixa de realizar cerca de 17 mil upserts individuais e passa a usar aproximadamente 34 lotes de 500. A reducao real de P95 sera registrada somente apos amostra comparavel em producao.
