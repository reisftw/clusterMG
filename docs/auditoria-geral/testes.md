# Testes

## Executados durante a auditoria

- Baseline `npm run verify:retiradas`: 107 arquivos e 614 testes aprovados; lint e build aprovados.
- Contratos: 13 de 13 aprovados.
- Regressao focal frontend: 3 arquivos e 9 testes apos as correcoes de Maps, API e modal.
- Regressao focal backend: 6 testes aprovados para seguranca e runner de migrations.
- E2E local: 4 aprovados, 7 ignorados e 1 limitado pela ausencia de backend no preview.

## Gate final

Antes de integrar: repetir `npm run verify:retiradas`, `npm run test:contracts`, teste PostgreSQL de migrations e build. O workflow deve executar o teste de integracao com `OBSERVABILITY_TEST_DATABASE_URL`.

Nao foi executada migration em banco de desenvolvimento ou producao durante a auditoria local.

