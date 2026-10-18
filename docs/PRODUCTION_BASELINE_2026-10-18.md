# Production Baseline - 2026-10-18

## Purpose

This document freezes the deployed state that existed when the repository was
reorganized. It is the operational starting point for the next development
cycle. It does not claim that a particular Git SHA produced every active build;
the archived deployment artifacts are the authority for recovery.

No service, database, Nginx configuration, or live release was changed while
creating this record.

## Captured production release pointers

Captured at: \`2026-10-18T20:00:42Z\`

| Product | Active release pointer |
| --- | --- |
| Retiradas frontend | \`/var/www/retiradas/releases/mfa-visible-cache-reset-20261016-1750\` |
| Mercado frontend | \`/var/www/mercado/releases/20261018-mercado-portal-restore-20261018164432\` |
| Retiradas API source | \`/opt/retiradas/vps\` |
| Operacao source | \`/opt/retiradas/apps/rot\` |

## Verified recovery archive

Remote directory:

\`\`\`text
/var/backups/cluster-mg-baseline-20261018-170000
\`\`\`

| Archive | SHA-256 |
| --- | --- |
| \`retiradas-frontend-build.tar.gz\` | \`0b1ec432f0932191b47788f420f53f773445005b81aa638c11b4ea48cdf9a596\` |
| \`retiradas-api-source.tar.gz\` | \`ee5f2b01b7759258a1bfd7b1be9b3b554f84964283f6d4f486e49ea833616a2e\` |
| \`mercado-frontend-build.tar.gz\` | \`24b454fe3f4852d2578f1f5b89a62bdeb66405624791ff34f5450c0316e99633\` |
| \`operacao-app-source.tar.gz\` | \`d3fdc85fa4a096b639ca67604c129007f70b9cac7ce268d7e7785dff1f95cb9c\` |

Verification command:

\`\`\`bash
cd /var/backups/cluster-mg-baseline-20261018-170000
sha256sum -c SHA256SUMS.txt
\`\`\`

## Local historical preservation

Before the repository cleanup, Git refs, unreachable objects, dirty-worktree
patches, and untracked files were preserved at:

\`\`\`text
C:\\Users\\rodri\\Desktop\\vps-producao\\_git-snapshots\\clusterMG-before-cicd-restructure-20261018-165535
\`\`\`

The snapshot contains both \`clusterMG-all-refs.bundle\` and
\`git-objects-all.tar.gz\`. Do not remove that directory until the new workflow
has completed at least one verified release cycle.

## Baseline policy

1. The active sites above remain the operational reference.
2. New work starts from reviewed Git branches, not from ad-hoc deployment
   directories.
3. Historical branches and local worktrees are archival material, not release
   candidates.
4. Any future rollback must use the verified archive or a later release
   artifact, never an unverified local \`dist\` directory.
