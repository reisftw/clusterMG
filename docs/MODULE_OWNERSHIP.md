# Module Ownership and Boundaries

## Retiradas

| Area | Location | Owner boundary |
| --- | --- | --- |
| Frontend | \`apps/retiradas/frontend\` | Internal Retiradas UI and shared shell. |
| Backend | \`apps/retiradas/backend\` | Retiradas API, workers, migrations, integrations, and API contracts. |
| Deployment support | \`apps/retiradas/backend/nginx\`, \`apps/retiradas/backend/systemd\` | Configuration templates only. |

Changes to authentication, shared navigation, CORS, service workers, data
models, or API middleware are Retiradas changes even when motivated by Mercado.

## Mercado

| Area | Location | Owner boundary |
| --- | --- | --- |
| Portal UI | \`apps/retiradas/frontend/src/modules/mercado\` | Marketplace routes, provider experience, public onboarding, and admin portal. |
| Portal API | \`apps/retiradas/backend/api/src/mercado\` | Provider authentication, lots, onboarding, privacy, and marketplace rules. |
| Brand assets | \`apps/retiradas/frontend/public\` | Dedicated Mercado assets must have explicit names and no Retiradas replacement. |

Mercado is independently released to \`mercado.retiradas.tech\`, but it is not
an independently stored database or backend. It must not expose protected
Retiradas data to provider APIs. Changes need privacy and authorization tests.

## Operacao

| Area | Location | Owner boundary |
| --- | --- | --- |
| Frontend | \`apps/operacao/frontend\` | Dedicated operational interface. |
| Backend | \`apps/operacao/backend\` | Dedicated API, migrations, and integrations. |
| Shared package | \`apps/operacao/shared\` | Only Operacao may change it without cross-module review. |

## Aprovações Lili

| Area | Location | Owner boundary |
| --- | --- | --- |
| Frontend | `apps/liliane/frontend` | Interface exclusiva em `/liliane`. |
| Backend | `apps/liliane/backend` | API, autenticação, migrações e decisões de aprovação. |
| Operations | `apps/liliane/ops` | Serviço, Nginx e Evolution isolados do Retiradas. |

Aprovações Lili compartilha apenas a VPS e o domínio com Retiradas. Banco,
processo, credenciais, sessão WhatsApp e release são independentes. Um deploy
do Lili não pode reiniciar ou publicar Retiradas, Mercado ou Operacao.

The deployed legacy path is \`/opt/retiradas/apps/rot\`; it is a deployment
target, not a source directory. Source lives under \`apps/operacao\`.

## Shared operations

| Area | Location | Required review |
| --- | --- | --- |
| CI/CD | \`.github/workflows\` | Affected product owners and release owner. |
| Migration/deployment support | \`ops/\` | Backend and operations review. |
| Root package/tooling | root \`package.json\`, lockfile, lint/test config | All affected modules. |

## Preserved modules outside this release model

\`apps/adm\` and \`apps/finan\` remain in the repository as historical
modules. They are intentionally excluded from the Retiradas, Mercado, and
Operacao release workflows introduced in this baseline. Do not delete or
publish either module as a side effect of this work.

## Ownership decision table

| Change | Required validation |
| --- | --- |
| Retiradas UI/API only | \`npm run verify:retiradas\` |
| Mercado UI/API | Retiradas lint, test, build, and Mercado API contract test |
| Operacao | \`npm run verify:operacao\` |
| Aprovações Lili | `npm run verify:liliane` |
| Workflow/tooling | Relevant CI contract tests and workflow review |
| Database schema | Target module validation plus migration/rollback review |
