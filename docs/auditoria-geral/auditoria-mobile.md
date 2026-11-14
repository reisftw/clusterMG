# Auditoria mobile

## Cobertura

Foram catalogadas 88 paginas/dashboards e inspecionados os elementos compartilhados de layout, modal, PWA e Maps. Os fluxos criticos examinados foram login, navegacao standalone, modal, mapa, geolocalizacao e painel publico.

## Resultado

- Corrigida a rolagem de fundo em modais sem remover o focus trap, Escape, backdrop ou restauracao do foco.
- Corrigido o redirecionamento indevido de `/painel/agentes` no PWA.
- Corrigidas corridas e excesso de navegacao no mapa, relevantes para redes moveis e GPS.
- Safe areas e `100dvh` ja estao presentes no shell de modal.

## Limitacoes

A execucao Playwright local teve 4 cenarios aprovados, 7 ignorados por pre-condicoes e 1 falha porque o preview local nao tinha backend para responder ao login invalido. Nao foi possivel declarar as 88 telas validadas visualmente em todas as oito larguras; isso permanece como campanha de QA, nao como correcao presumida.

Pendencias: reconciliacao incremental de marcadores, tela offline dedicada e aviso nao destrutivo de atualizacao do service worker.

