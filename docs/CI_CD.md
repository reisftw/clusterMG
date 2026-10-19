# CI/CD Architecture

## Design

CI is separated by product. A push validates code only; it never publishes to
production as a side effect.

| Workflow | Responsibility | Trigger |
| --- | --- | --- |
| \`ci-retiradas.yml\` | Retiradas frontend/backend lint, tests, contracts, build | Pull request, scoped push, manual |
| \`ci-mercado.yml\` | Mercado module plus shared Retiradas compatibility | Pull request, scoped push, manual |
| \`ci-operacao.yml\` | Operacao frontend/backend validation | Pull request, scoped push, manual |
| \`security.yml\` | Dependency audit and secret scan | Scoped pull request/push, schedule, manual |
| \`deploy-retiradas.yml\` | Manual Retiradas release and production publication | Manual only, production from \`master\` |
| \`deploy-mercado.yml\` | Manual Mercado release candidate | Manual only |
| \`deploy-operacao.yml\` | Manual Operacao release candidate | Manual only |

The prior monolithic workflows are preserved in \`docs/ci/archive/\`. They are
not active GitHub Actions workflows.

## GitHub environments

The following GitHub Environments were created on 2026-10-18 and are used by
the corresponding manual release workflows:

\`\`\`text
release-retiradas
release-mercado
release-operacao
production-retiradas
production-mercado
production-operacao
homolog-retiradas
homolog-mercado
homolog-operacao
\`\`\`

When branch-policy and reviewer protection are available for this private
repository, configure every production environment to:

1. require at least one designated reviewer;
2. keep deployment secrets scoped to that environment;
3. restrict access to the release branches;
4. retain deployment logs and release artifacts;
5. do not allow self-approval when GitHub plan settings support it.

The repository is currently on a GitHub plan that does not provide branch
protection, rulesets, or custom deployment-branch policies for private
repositories. The current safeguards are therefore the manual-only release
trigger, product-scoped workflows, serialized release concurrency, CI checks,
checksummed artifacts, and release manifests. See
`docs/GITHUB_REPOSITORY_SETTINGS.md` for the exact configuration and the
upgrade checklist.

## Release behavior

The Mercado and Operacao release workflows create verified artifacts only.
The Retiradas workflow additionally publishes its verified frontend artifact
when manually dispatched from \`master\` through the
\`production-retiradas\` environment.

Each manual release requires a module-local \`release_version\` and uploads a
\`release-manifest.json\` beside the checksummed artifacts. The manifest records
the module, requested version, commit SHA, source ref, workflow run, build
timestamp, and artifact SHA-256 values. Releases for the same module are
serialized with a workflow concurrency group.

The Retiradas publication adapter:

1. publishes only the checksummed artifact produced by the same workflow;
2. use the relevant protected production environment;
3. create a named release directory;
4. validate health before switching traffic;
5. record the SHA, release ID, and rollback target;
6. never deploys another product as a side effect.

Backend publication remains outside this adapter. Mercado and Operacao remain
artifact-only until their production paths and rollback procedures receive the
same treatment.

## Security

\`security.yml\` runs dependency audit and secret scanning. A registry outage
is reported explicitly; vulnerabilities are not silently ignored. Code scans
must be added only after their service credentials and failure policy are
defined.
