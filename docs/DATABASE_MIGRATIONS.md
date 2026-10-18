# Database Migrations

## Ownership

| Product | Migration directory | Runner | Tracking table |
| --- | --- | --- | --- |
| Retiradas and Mercado | `apps/retiradas/backend/sql` | `npm --prefix apps/retiradas/backend run migrate:sql` | Managed by the Retiradas migration runner. |
| Operacao | `apps/operacao/backend/sql` | `npm --prefix apps/operacao/backend run migrate` | `rot_migrations` |

Mercado shares Retiradas database contracts. A Mercado migration belongs in the
Retiradas migration directory, must identify its Mercado ownership in the file
header, and must be reviewed as a shared API/database change.

## Required workflow

1. Add one forward-only SQL file with the next numeric prefix.
2. Prefer additive, backward-compatible changes: new tables, nullable columns,
   indexes created safely, and new data paths before retiring old ones.
3. Make operations idempotent where practical with `IF EXISTS`, `IF NOT EXISTS`,
   or a guarded migration record.
4. Add or update tests that prove application compatibility before and after the
   migration.
5. Record the migration ID, affected module, preflight checks, and recovery
   procedure in the release notes.
6. Take and verify a database backup immediately before a production migration.
7. Run the migration only from a reviewed release procedure, never as a side
   effect of a local build or a branch push.

## Expand/contract rule

For incompatible schema changes, use two releases:

1. **Expand:** add compatible schema and dual-read/dual-write behavior.
2. **Contract:** remove the legacy behavior only after the compatible release is
   healthy and the data has been verified.

An application rollback must remain compatible with the expanded schema. Do not
assume an application rollback can safely reverse a database migration.

## Prohibited operations

- destructive `DROP`, `TRUNCATE`, or broad `DELETE` without explicit approved
  backup and recovery documentation;
- changing historical migration files after they could have run anywhere;
- running a Retiradas/Mercado schema migration while ignoring the other module's
  compatibility tests;
- embedding credentials, data extracts, or production backups in migrations.

## Release evidence

Every production release that includes a migration must record:

```text
module, migration IDs, commit SHA, backup reference, operator,
start/end time, validation result, and rollback compatibility
```
