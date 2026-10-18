# Cluster MG - Operating Guide

## Scope

This repository contains independent products that share selected infrastructure.
Treat each product as a bounded module. Do not make a cross-module change
unless the contract and release impact are documented first.

The production baseline captured on 2026-10-18 is documented in
\`docs/PRODUCTION_BASELINE_2026-10-18.md\`. It is the recovery reference for
the next development cycle.

## Modules

| Module | Source of truth | Production domain | Notes |
| --- | --- | --- | --- |
| Retiradas | \`apps/retiradas/frontend\`, \`apps/retiradas/backend\` | \`retiradas.tech\` | Main internal operation application. |
| Mercado | \`apps/retiradas/frontend/src/modules/mercado\`, \`apps/retiradas/backend/api/src/mercado\` | \`mercado.retiradas.tech\` | Public provider portal. It shares the Retiradas backend and database contract. |
| Operacao | \`apps/operacao\` | \`operacao.sempre.net.br\` | Dedicated application and service. |
| Shared operations | \`ops/\`, root tooling, \`.github/\` | N/A | Changes need an impact note for every affected module. |

The existing \`apps/adm\` and \`apps/finan\` trees remain preserved historical
modules. They are outside this three-product baseline and must not be removed,
published, or silently included in a product release without a separate audit.

## Branches

- \`master\`: protected integration/reference branch. Never force-push.
- \`retiradas\`: work line for Retiradas-only changes.
- \`mercado\`: work line for Mercado-only changes.
- \`operacao\`: work line for Operacao-only changes.
- \`homolog-dev\`: environment integration branch. It is not a feature branch.
- \`feature/*\`, \`fix/*\`, \`hotfix/*\`, \`chore/*\`: short-lived branches.

Do not repurpose a product branch as a scratch branch. Do not reset a shared
branch to make a local worktree look clean. Preserve first, then create a
new branch or worktree.

## Change rules

1. Read \`docs/MODULE_OWNERSHIP.md\` before changing a boundary.
2. Retiradas and Mercado share API routes and database access. A Mercado
   change must still pass Retiradas build and contract validation.
3. Operacao must not be published as a side effect of a Retiradas or Mercado
   change.
4. Do not commit generated builds, dependency directories, deployment tarballs,
   local screenshots, credentials, or production environment files.
5. Migrations must be additive, idempotent when possible, and documented with
   a rollback plan. Do not run migrations from a development task.
6. Deployment is never a side effect of a push. A human starts the appropriate
   manual GitHub Actions release workflow after CI is green and approvals are
   granted.

## Verification

Run the narrowest relevant validation first:

\`\`\`bash
npm run verify:retiradas
npm run verify:operacao
npm run test:contracts
\`\`\`

For Mercado work, run:

\`\`\`bash
npm run lint:retiradas
npm run test:retiradas
npm run build:retiradas
node --test apps/retiradas/backend/api/src/mercado/progressivePrivacy.test.js
\`\`\`

Read \`docs/CI_CD.md\`, \`docs/DEPLOY.md\`, and \`docs/ROLLBACK.md\` before
changing workflows or release automation.
