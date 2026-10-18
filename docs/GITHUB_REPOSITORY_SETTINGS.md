# GitHub Repository Settings

## Current configuration

Verified on 2026-10-18 for `reisftw/clusterMG`:

- GitHub Actions is enabled and all product CI, security, and manual release
  workflows are active.
- Default workflow permission is read-only.
- Workflows cannot approve pull-request reviews.
- Nine environments exist for release, homologation, and production across
  Retiradas, Mercado, and Operacao.
- Release workflows run only through manual dispatch and produce a versioned,
  checksummed artifact with a `release-manifest.json` file.
- No current workflow connects to a server or changes a running service.

## Plan limitation

GitHub returned the following limitation for this private repository:

`Upgrade to GitHub Pro or make this repository public to enable this feature.`

Because the repository must remain private, do not make it public merely to
enable protections. Branch protection, rulesets, and custom deployment-branch
policies must be enabled after GitHub Pro (or an eligible organization plan) is
available.

## Configure after the upgrade

Protect these branches from deletion and force pushes:

- `master`
- `retiradas`
- `mercado`
- `operacao`
- `homolog-dev`

Then configure branch policy by environment:

| Environment | Allowed branch |
| --- | --- |
| `production-retiradas` | `master` |
| `production-mercado` | `master` |
| `production-operacao` | `master` |
| `homolog-retiradas` | `homolog-dev` |
| `homolog-mercado` | `homolog-dev` |
| `homolog-operacao` | `homolog-dev` |
| `release-retiradas` | `retiradas`, `homolog-dev`, `master` |
| `release-mercado` | `mercado`, `homolog-dev`, `master` |
| `release-operacao` | `operacao`, `homolog-dev`, `master` |

Add at least one separate release reviewer before requiring approvals. A
one-person reviewer rule would make releases impossible or encourage bypasses.

## Future deployment secrets

Do not create placeholder secrets. When the reviewed publication adapter is
introduced, scope real values to the relevant production environment:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_KNOWN_HOSTS`

Use non-secret environment variables for destination paths and service names.
The publication adapter must be reviewed with its rollback behavior before any
of these values are used.
