# Git Strategy

## Baseline

The current production artifacts are frozen in
\`docs/PRODUCTION_BASELINE_2026-10-18.md\`. The repository history remains
available for forensics, but it is not the release decision source for the new
cycle.

## Long-lived branches

| Branch | Responsibility | Promotion rule |
| --- | --- | --- |
| \`master\` | Reviewed integration and production release candidate | Merge only after module CI is green and release notes exist. |
| \`retiradas\` | Retiradas application work | Merge into \`master\` through review. |
| \`mercado\` | Mercado portal work | Merge into \`master\` through review plus Retiradas compatibility checks. |
| \`operacao\` | Operacao application work | Merge into \`master\` through review and Operacao CI. |
| \`homolog-dev\` | Environment integration | Receives selected, reviewed changes for homologation. |

## Short-lived branches

Use one of:

\`\`\`text
feature/<scope>
fix/<scope>
hotfix/<scope>
chore/<scope>
\`\`\`

Create a pull request to the matching product branch first. Promote to
\`master\` only after the product owner approves the release scope.

## Rules

- Never force-push \`master\`, \`retiradas\`, \`mercado\`, \`operacao\`, or
  \`homolog-dev\`.
- Never use a production deployment directory as a development checkout.
- Keep one concern per pull request.
- A Mercado pull request must identify any shared Retiradas API, migration, or
  privacy impact.
- A workflow or deployment change requires a rollback note.
- Historical branches remain recoverable until the baseline has been proven by
  a complete green release cycle.

## Version labels

Use the release identifier:

\`\`\`text
<module>-YYYY.MM.DD+<short-sha>
\`\`\`

Examples:

\`\`\`text
retiradas-2026.10.18+abc1234
mercado-2026.10.18+abc1234
operacao-2026.10.18+abc1234
\`\`\`

The build must display its short SHA and environment. The release manifest in
\`ops/release-baselines/2026-10-18.json\` records the starting baseline.
