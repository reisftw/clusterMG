# Causas raiz

| Frente | Causa confirmada | Efeito |
| --- | --- | --- |
| Movimentacoes | Periodos date-only nao representavam explicitamente o dia inteiro em Sao Paulo; o checkpoint era restrito ao backfill anual | Virada de mes e falhas intermediarias exigiam releitura ampla |
| Recuperacao de ativos | Todas as rotas de leitura chamavam conciliacao completa | Cinco endpoints compartilhavam o mesmo P95 alto |
| Tecnicos | Agregacao inteira era enviada ao React e paginada no cliente | Payload e memoria cresciam com a base |
| MAPA/MATCH | Persistencia linha a linha e atualizacao de linhas inalteradas | Milhares de queries e escrita desnecessaria por ciclo |
| HubSoft | Retry fixo e somente no nivel da execucao | Recuperacao lenta de timeout por pagina |
| Evolution | Confirmacao e callback sincronos | Resposta do webhook dependia de processamento externo |
| Notificacoes | Telemetria de leitura era aguardada | A confirmacao ao usuario herdava latencia secundaria |

O pool PostgreSQL e locks foram investigados e nao se mostraram causa primaria na amostra coletada.
