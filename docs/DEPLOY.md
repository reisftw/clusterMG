# Deployment Runbook

## Safety rule

No deployment is triggered by a branch push. A release operator starts the
matching manual GitHub Actions workflow after CI is green.

## Current state

The baseline has been captured, but release directories and backend switching
are not yet normalized across all products. The manual workflows therefore
produce validated release artifacts and do not modify a server.

This avoids repeating the prior failure mode where a source branch changed a
live service without an independently verified artifact or rollback point.

## Publication adapter checklist

Before a product gets a server publishing step, the pull request must include:

1. exact service account, target host, and target paths;
2. a release-directory strategy with a \`current\` pointer or equivalent;
3. pre-deploy backup behavior for code and required migration preflight;
4. a health endpoint and retry policy;
5. a one-command rollback to the prior release;
6. product-specific smoke checks;
7. no shared application deployment unless explicitly required and approved.

## Required validation before a release

| Product | Validation |
| --- | --- |
| Retiradas | \`npm run verify:retiradas\` and \`npm run test:contracts\` |
| Mercado | \`npm run lint:retiradas\`, \`npm run test:retiradas\`, \`npm run build:retiradas\`, Mercado API privacy test |
| Operacao | \`npm run verify:operacao\` |

## Artifact retention

Keep the last ten successful release artifacts per product and every artifact
referenced by an incident or rollback. Never use an untracked local
\`dist\` folder as a production artifact. Retain the accompanying
\`release-manifest.json\`; it is the traceability record that connects a module
version, commit, GitHub workflow run, and checksummed artifact.
