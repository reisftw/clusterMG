# Diagnostico integrado P0

Data da investigacao: 2026-11-06.

## Evidencias de producao

- A API estava ativa, consumindo aproximadamente 623 MB.
- O PostgreSQL tinha 14 sessoes: uma ativa, 13 ociosas e nenhuma transacao ociosa.
- Nao foram encontrados locks ou saturacao do pool durante a coleta.
- A base de recuperacao tinha aproximadamente 21,8 mil snapshots; movimentacoes, 40,2 mil registros; sincronizacao HubSoft, 129,3 mil registros.
- MAPA concluia em aproximadamente 115 a 160 segundos e MATCH em 150 a 240 segundos nas amostras recentes.
- As cinco leituras de recuperacao executavam conciliacao completa no caminho HTTP.
- MAPA/MATCH persistiam de 15 a 17 mil registros com um upsert por registro, inclusive quando nada mudava.
- O webhook Evolution aguardava todo o processamento de confirmacao e callback antes da resposta.
- A marcacao de notificacoes como lidas aguardava a telemetria de push.

## Conclusao

Nao havia uma unica saturacao global do PostgreSQL. A latencia vinha principalmente de trabalho pesado sincrono dentro de rotas de leitura, excesso de round-trips de escrita e integracoes externas mantidas no caminho critico HTTP.
