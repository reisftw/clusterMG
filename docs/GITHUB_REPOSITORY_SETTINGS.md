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
- The manually dispatched Retiradas release workflow can publish its verified
  frontend artifact from \`master\` through \`production-retiradas\`.
- Mercado and Operacao release workflows do not connect to production.

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

## Deployment secrets

Retiradas currently uses the existing repository secrets below. Move them to
the \`production-retiradas\` environment when environment-secret management is
available for the repository plan:

- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`
- `VPS_SSH_KEY`

Destination paths remain non-secret workflow variables. The adapter records
the previous release and restores it automatically when Nginx validation or
the public health checks fail.
