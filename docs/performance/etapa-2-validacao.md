# Etapa 2 - Validacao

## Concluido localmente

- Testes unitarios direcionados do runner de migrations.
- Testes da distribuicao por bairro.
- Testes do resumo operacional e singleflight.
- Comparacao SQL anterior/nova com `EXCEPT ALL` nas duas direcoes.
- `EXPLAIN (ANALYZE, BUFFERS)` da consulta otimizada em producao, somente
  leitura e com timeout.

## Validacao pre-deploy

- `npm run verify:retiradas`: aprovado, com 100 arquivos e 578 testes.
- `npm run test:contracts`: aprovado, com 11 testes.
- Testes PostgreSQL das migrations 113 e 114-119: aprovados no CI.
- Build de producao: aprovado.
- Workflows YAML e contratos de release: aprovados.
- Espaco, propriedade das tabelas e capacidade de backup: confirmados na VPS.

## Validacao pos-deploy

- Workflow `41690131884`: concluido com sucesso.
- Healthcheck interno e HTTPS: `200`, banco conectado.
- Frontend ativo: `c172d2d`, release
  `v2026.11.03-performance-etapa2`.
- Migrations 114-119: registradas em `schema_migrations`.
- Seis indices: `indisvalid=true` e `indisready=true`.
- Indices invalidos no schema `public`: zero.
- Locks em espera: zero.
- Transacoes com mais de 60 segundos: zero.
- Healthcheck publico: `200`.
- Rotas protegidas de Tentativas e Acompanhamento sem sessao: `401`, sem
  resposta `500`.
- Logs do servico desde o deploy: sem warnings ou erros.
- Backup custom PostgreSQL: 356.764.046 bytes, validado por
  `pg_restore --list` antes das migrations.

O smoke autenticado por usuario real nao foi automatizado porque o pipeline nao
possui uma credencial de teste dedicada. Os testes de RBAC, autenticacao e
contratos passaram no CI; a validacao em producao foi deliberadamente limitada
a healthchecks e contratos sem sessao para nao reutilizar credenciais pessoais.

As tabelas de metricas nao receberam amostra comparavel logo apos o deploy. O
ganho de 95,0% e o resultado medido da consulta SQL no mesmo banco, nao uma
promessa de reducao identica para a latencia HTTP.
