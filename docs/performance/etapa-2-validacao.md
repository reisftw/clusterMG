# Etapa 2 - Validacao

## Concluido localmente

- Testes unitarios direcionados do runner de migrations.
- Testes da distribuicao por bairro.
- Testes do resumo operacional e singleflight.
- Comparacao SQL anterior/nova com `EXCEPT ALL` nas duas direcoes.
- `EXPLAIN (ANALYZE, BUFFERS)` da consulta otimizada em producao, somente
  leitura e com timeout.

## Obrigatorio antes do deploy

- `npm run verify:retiradas`.
- `npm run test:contracts`.
- Teste PostgreSQL das migrations 113 e 114-119 no CI.
- Build de producao.
- Verificacao dos contratos de workflow.
- Confirmacao de espaco para backup na VPS.

## Obrigatorio depois do deploy

- Healthcheck interno e HTTPS.
- Versao publicada no frontend.
- Migrations 114-119 registradas.
- Seis indices validos.
- Ausencia de lock em espera e transacao ociosa.
- Smoke read-only de autenticacao, acompanhamento, agendamentos, documentos,
  mapas e tentativas.
- Comparacao das metricas apenas depois de amostra suficiente e equivalente.

Resultados finais do CI e da producao serao registrados depois da publicacao;
este documento nao antecipa aprovacao.
