# Testes

Executados em 2026-11-02:

| Comando | Resultado |
| --- | --- |
| `node --test ...metrics.test.js ...db.observability.test.js ...113_observability_wave0.test.js` | 14/14 |
| `npm run verify:retiradas` | lint, 98 arquivos, 573 testes e build aprovados |
| `npm run test:contracts` | 11/11 |
| `git diff --check` | aprovado |
| benchmark sintetico do middleware | 0,007401 ms/requisicao |

O teste real da migration fica em
`113_observability_wave0.integration.test.js` e roda no PostgreSQL 16
descartavel do CI. A aprovacao do workflow deve ser registrada antes do deploy.

