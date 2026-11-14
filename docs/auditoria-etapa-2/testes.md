# Testes e matriz de validacao

| Correcao | Antes | Depois automatizado | Producao |
|---|---|---|---|
| Meta | Dois workers elegiam o mesmo `PENDING`. | Claim atomico e reentrega concorrente processam uma vez. | Duplicados, claims expirados, tentativas. |
| HubSoft | Owner compartilhado. | Owners exclusivos, release condicionado, retry e concorrencia testados. | Sobreposicoes, `LOCK_LOST`, P95/P99, pool. |
| Evolution | Falha podia receber ACK. | Falhas ficam recuperaveis, DLQ e requeue testados. | Pendentes antigos, retries, DLQ. |
| Maps | Refresh reconstruia todos os markers. | Delta de 1 em 15 mil atualiza uma instancia. | Render, memoria e travamentos. |
| PWA | Ativacao/reload automatico. | Update so ativa apos confirmacao. | Reload inesperado e eventos SW. |
| Rollback | Schema sem contrato verificavel. | CI bloqueia migration incompatível. | Health e release anterior recuperavel. |

Gates obrigatorios: `npm run verify:retiradas`, testes backend focados, migration 125 em PostgreSQL, `npm run test:contracts`, `git diff --check` e workflow oficial verde.
