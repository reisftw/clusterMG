# Snapshots e frescor

O cache usa troca atômica por referência: somente uma carga concluída substitui `data` e `cachedAt`. Falhas preservam o último resultado íntegro. Chamadas concorrentes compartilham a mesma Promise.

| Leitura | TTL | Sinal de frescor | Desativação independente |
| --- | ---: | --- | --- |
| Painel público/acompanhamento | existente por rota | `X-Cache-Status`, `X-Cache-Age-Ms` | `PUBLIC_DASHBOARD_BACKGROUND_REFRESH=false` |
| Resumo operacional | 15 s | cabeçalhos de cache + `lastMapUpdate` da origem | `OPERATIONAL_SUMMARY_BACKGROUND_REFRESH=false` |

Desativar a revalidação em segundo plano restaura a espera bloqueante anterior sem desligar o cache nem os jobs. O cache não altera os SLAs dos jobs e não inventa atualização da origem.
