# Rollback Runbook

## Principle

Rollback is a release operation, not a file-copy operation. Use a previously
verified release artifact and record the reason, operator, target product, and
resulting health check.

## Baseline fallback

If the first release cycle after this reorganization fails, the recovery
reference is:

\`\`\`text
/var/backups/cluster-mg-baseline-20261018-170000
\`\`\`

Verify it before use:

\`\`\`bash
cd /var/backups/cluster-mg-baseline-20261018-170000
sha256sum -c SHA256SUMS.txt
\`\`\`

## Product rollback sequence

1. Stop the release procedure before migrations or traffic changes continue.
2. Identify the last healthy product-specific release artifact.
3. Restore only that product's frontend/backend release pointer.
4. Restart only its owning service when required.
5. Run the product health endpoint and a smoke test.
6. Record the incident and preserve logs/artifacts.

## Database safety

Do not restore a database solely because an application build failed. Restore
only when a reviewed migration or data operation requires it. The backup to use
must be the one recorded immediately before the affected migration.

## Prohibited rollback shortcuts

- Do not copy an arbitrary local \`dist\` directory to production.
- Do not reset a production branch with force-push.
- Do not restore another product to fix an isolated product incident.
- Do not delete the failed artifact until the incident is closed.
