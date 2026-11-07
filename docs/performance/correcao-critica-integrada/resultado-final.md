# Resultado final

## Situacao final

| Correcao | Problema | Solucao | Status |
| --- | --- | --- | --- |
| 01 | Periodos e retomada de movimentacoes | Datas Sao Paulo, janelas, checkpoint e upsert | Publicada e recuperacao concluida |
| 02 | Recuperacao lenta e tecnicos sem pagina | Job incremental, lotes e pagina SQL | Publicada e conciliacao validada |
| 03 | MAPA/MATCH lentos e instaveis | Retry, checkpoints e upsert em lote | Publicada; retomada automatica observada |
| 04 | APIs aguardando tarefas secundarias | Inbox Evolution e efeitos secundarios assincronos | Publicada e worker ativo |

## Metricas antes e depois

O baseline esta em `performance-apis.md` e `jobs-criticos.md`. No smoke, a API usou aproximadamente 309 MiB, contra aproximadamente 623 MiB na leitura anterior ao deploy. Essa amostra isolada confirma estabilidade, mas nao prova ganho sustentado nem substitui uma janela de observacao.

## Integridade

- Nenhuma migration destrutiva.
- Nenhum dado de teste criado em producao.
- Nenhum saldo ou regra financeira alterado.
- Upserts e deduplicacao preservam idempotencia.
- Backfill limitado a janelas controladas.

## Publicacao e smoke

- Commit/versao: `c955bc7` / `v2026.11.07-c955bc7-p0`.
- Migration aplicada: `121_integrated_p0_reliability.sql`.
- Workflow: run `42332182726`, concluido com sucesso.
- Health check local e publico: aprovado.
- Recuperacao outubro/novembro: concluida entre `2026-10-01` e `2026-11-07`, com 2.771 processados, 23.303 ignorados e 456 rejeitados registrados.
- Recuperacao de ativos: `AUTO_INCREMENTAL` concluido com 1.453 registros persistidos.
- Paginacao de tecnicos: consulta real de 2.481 snapshots, 217 grupos e pagina de 25 itens executada em 20,9 ms usando o indice de `closed_at`.
- MAPA: execucao interrompida pelo reinicio foi marcada `STALE_RUN` e retomada automaticamente na sequencia.
- Medicao posterior: ainda insuficiente para comparar P95 de endpoints ou duracao completa de MAPA/MATCH com significancia estatistica.

Nenhum numero posterior foi estimado. O resultado de longo prazo depende da latencia e disponibilidade do HubSoft.
