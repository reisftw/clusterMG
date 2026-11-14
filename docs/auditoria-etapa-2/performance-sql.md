# Performance SQL

Foram revistos os caminhos de alto volume de Maps, webhooks, Evolution e jobs HubSoft. Maps entrega o conjunto necessario ao mapa e ja possui indices de bounding box, localizacao, geocode e filas; trocar essa leitura por paginacao convencional quebraria a visao integral exigida pelo produto.

O novo claim Meta tem indice parcial por estado, claim e recebimento. Evolution ja possui indice parcial de pendentes. HubSoft ja possui indices por profile, atividade e data. Nenhum indice especulativo adicional foi criado sem `EXPLAIN ANALYZE` de producao.

Paginacoes administrativas continuam limitadas. Pontos a acompanhar: offsets profundos em auditoria/recuperacao e leituras `listAll` legadas; migrar para keyset apenas com contrato de ordenacao e medicao real.

Meta pos-deploy: comparar P50/P95/P99, SQL por requisicao, espera do pool e idade dos snapshots em janelas equivalentes.
