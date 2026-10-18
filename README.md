# Cluster MG

Monorepo das aplicacoes Retiradas, Mercado de Retiradas e Operacao.

## Starting point

The current production artifacts were frozen on 2026-10-18 before this
repository reorganization. Read
\`docs/PRODUCTION_BASELINE_2026-10-18.md\` before changing release or
deployment behavior.

## Applications

| Product | Source | Domain |
| --- | --- | --- |
| Retiradas | \`apps/retiradas/frontend\`, \`apps/retiradas/backend\` | \`retiradas.tech\` |
| Mercado de Retiradas | \`apps/retiradas/frontend/src/modules/mercado\`, \`apps/retiradas/backend/api/src/mercado\` | \`mercado.retiradas.tech\` |
| Operacao | \`apps/operacao\` | \`operacao.sempre.net.br\` |

Mercado has its own public domain and release artifact, but shares Retiradas
API/database contracts. See \`docs/MODULE_OWNERSHIP.md\`.

## Local verification

\`\`\`bash
npm run verify:retiradas
npm run verify:operacao
npm run test:contracts
\`\`\`

For Mercado:

\`\`\`bash
npm run lint:retiradas
npm run test:retiradas
npm run build:retiradas
node --test apps/retiradas/backend/api/src/mercado/progressivePrivacy.test.js
\`\`\`

## Delivery

Pushes validate code only. They do not deploy any product. The GitHub Actions
release workflows generate verified artifacts through manual dispatch and do
not yet modify servers.

Read:

- \`AGENTS.md\`
- \`docs/BRANCHES.md\`
- \`docs/GIT_STRATEGY.md\`
- \`docs/CI_CD.md\`
- \`docs/DEPLOY.md\`
- \`docs/ROLLBACK.md\`
