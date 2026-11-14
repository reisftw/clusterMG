# AUD-013 - Marcadores do Maps

Os marcadores passaram a ser reconciliados por ID e fingerprint. Instancias sem mudanca sao preservadas; apenas inclusoes, remocoes, alteracoes visuais e mudancas de coordenada chegam ao cluster.

O benchmark deterministico usa 15 mil pontos e altera somente um: resultado esperado `added=0`, `updated=1`, `removed=0`, sem `addLayers` ou `removeLayers` globais e abaixo de um segundo no ambiente de teste.

Validar em producao tempo de renderizacao, travamentos e memoria em aparelhos representativos. Rollback e isolado ao utilitario e `MapsCanvas`.
