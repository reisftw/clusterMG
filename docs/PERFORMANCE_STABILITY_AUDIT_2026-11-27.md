# REVO Performance and Stability Audit - 2026-11-27

## Executive summary

This audit used production aggregates from equivalent 24-hour and 30-day
windows, host and PostgreSQL health checks, and the deployed source. It found
two actionable defects with low-risk corrections:

1. The root service worker intercepted every same-origin GET outside `/api`,
   including routes owned by other applications and non-static pages. A single
   failed optional asset also aborted the whole installation.
2. `GET /api/notifications/summary` checked pending document notifications one
   by one and read the same notification list twice. It was the largest SQL
   consumer per ordinary HTTP request in the 30-day sample.

The production database and pool are healthy at the time of inspection. The
10.58 second pool wait is a historical spike, not a current leak. No schema,
data, pool-size, PostgreSQL setting, job schedule, RBAC rule, or external API
contract is changed by this release.

## Production baseline

Collected on 2026-11-27 before the change. Counters were not reset.

| Indicator | 30 days | Last 24 hours |
| --- | ---: | ---: |
| HTTP requests | 658,944 | 25,958 |
| HTTP 4xx | 11,298 | 394 |
| HTTP 5xx | 243 | 1 |
| Logical SQL queries | 3,430,530 | 123,212 |
| Logical SQL / HTTP request | 5.206 | 4.747 |
| SQL errors | 613 | - |
| Average pool wait | 3.239 ms | 1.276 ms |
| Maximum pool wait | 10,578.342 ms | 2,499.730 ms |
| Pool acquisition timeouts | 28 | 0 |

The 30-day 4xx value is higher than the original dashboard reference because
the raw aggregate includes expected validation and authentication responses.
It must not be treated as an internal-error count.

Host snapshot:

- 2 vCPU, 7.8 GiB RAM, 4 GiB swap.
- Approximately 31 GiB free disk space.
- Retiradas API, Nginx, and PostgreSQL active.
- One API process, application pool maximum 20, PostgreSQL maximum 100.
- 11 database backends during inspection; none blocked or idle in transaction.
- API process memory approximately 573 MiB.

PostgreSQL cumulative evidence:

- PostgreSQL 16.15.
- Cache hit ratio: 57.62% over the lifetime of the current statistics.
- 18 cumulative deadlocks.
- 220,828 temporary files and approximately 1.6 TiB cumulative temporary data.
- `pg_stat_statements` is unavailable and `shared_preload_libraries` is empty.

The cumulative database counters justify a dedicated query-plan audit, but
they do not identify which current query caused the historical totals.
Enabling `pg_stat_statements` requires a planned PostgreSQL restart and is not
safe to combine with this application hotfix.

## HTTP, SQL, jobs, and integrations

Largest ordinary HTTP SQL consumers in the 30-day aggregate:

| Route | Requests | SQL total | SQL/request | Evidence |
| --- | ---: | ---: | ---: | --- |
| `GET /api/notifications/summary` | 32,420 | 602,208 | 18.58 | N+1 existence checks and duplicate list read |
| `GET /api/acompanhamento/operational-summary` | 49,300 | 570,533 | 11.57 | Operational aggregation |
| `GET /api/documents` | 96,560 | 343,117 | 3.55 | Expected paginated document access |
| `GET /api/agendamentos/` | 93,478 | 316,595 | 3.39 | Expected operational list access |
| `GET /api/acompanhamento/resumo` | - | - | 1.98 | SQL mean 133.7 ms; HTTP mean 465 ms |

High-query batch routes such as port-release search and equipment recovery are
not comparable with interactive reads because one request intentionally
processes many records.

The 30-day operation metrics also show the dominant background load:

- HubSoft MAPA: 774 runs, 235 failures, 149 timeouts, average 181 seconds.
- HubSoft MATCH: 734 runs, 196 failures, 121 timeouts, average 210 seconds.
- HubSoft HTTP: 14,065 calls, 364 failures, 195 timeouts, average 6.98 seconds.
- AutoISP serial lookup: 46 calls, 39 failures.

These failures are primarily external or historical. Increasing database pool
size would not correct them and could increase database contention.

Only one 5xx occurred in the last 24 hours: `POST /api/notifications/read`.
The historical 5xx ranking is dominated by maps points, equipment serial,
port-release stats, maps health, and Retorninho routes that have since received
separate corrections. The current 24-hour window does not demonstrate a broad
active 5xx incident.

## Root causes and corrections

### Service worker

Production recorded 4,037 heartbeats, 1,053 update discoveries, 935 installs,
854 activations, 45 cache failures, 22 navigation failures, and one install
failure in the inspected 30-day period.

Root causes:

- The root-scoped worker handled arbitrary same-origin resources, including
  `/liliane/` and application routes that must remain network-owned.
- `cache.addAll()` made installation atomic: one missing optional asset rejected
  the full installation.
- The frontend emitted `UPDATE_READY`, but the backend rejected that event as
  invalid, creating avoidable 400 responses and losing update telemetry.

Correction:

- Non-navigation interception is restricted to `/assets/` and the explicit
  application shell.
- Each shell asset is cached independently with `Promise.allSettled()`.
- Failed paths are reported without preventing the valid shell from installing.
- `INSTALLED` is emitted after the cache attempt with success/failure counts.
- `UPDATE_READY` is accepted by service-worker telemetry.

Authenticated API responses remain outside the cache. Navigation remains
network-first with the existing offline response. Update activation remains an
explicit user action, preserving in-progress forms.

### Notification summary

Root causes:

- Up to 50 pending submissions each executed an individual existence query.
- The first page and unread counter independently loaded the same notification
  rows for the normal first-page request.

Correction:

- Existing deduplication IDs are fetched in one parameterized batch query.
- The first-page result is reused to calculate the unread counter.
- Target, role, regional, company, and user authorization remain unchanged.
- Push delivery occurs only for genuinely missing notifications, as before.

Query budget covered by an automated regression test:

- Three pending submissions: one batch existence query, zero individual
  existence queries, and one notification-list query.
- At the maximum 50 pending submissions, the existence-check portion falls
  from up to 50 logical queries to one (up to 98% fewer for that portion).

At the observed 32,420 summary calls per 30 days, the exact monthly saving
depends on how many pending rows each call sees. The conservative formula is
`calls_with_pending * max(pending_rows - 1, 0)`, plus one avoided list query on
each first-page call. Production validation must use a new equivalent window;
no unmeasured percentage is claimed here.

## Pool and transaction assessment

The application uses a maximum pool size of 20 and a five-second acquisition
timeout. Authenticated database calls run in a short transaction to set RLS
context safely. Logical query metrics do not include every `BEGIN`,
`set_config`, and `COMMIT`, so logical SQL/request is not a physical-statement
count.

No unreleased client, blocked backend, or idle transaction was observed. The
historical maximum aligns with periods of operational-summary traffic and
long-running synchronization jobs. The correct next step is percentile and
query-plan instrumentation, not a blind pool increase.

## Validation and rollback

Validation performed before release:

- Focused notification tests: 4 passed.
- Service-worker update and isolation tests: 6 passed.
- Full Retiradas suite: 112 files and 637 tests passed.
- ESLint passed.
- Production build passed.
- No migration and no data mutation introduced.

Rollback is application-only: deploy the immediately previous verified
Retiradas release through the official workflow. Database rollback is neither
required nor appropriate because this change has no schema or data migration.

## Post-deploy validation plan

After publication, verify:

1. Deployed commit and release metadata match the approved merge.
2. Frontend and `/api/health` return success.
3. Login, notification summary, read action, maps, dashboard, and maintenance
   load without new 5xx responses.
4. A newly installed worker reports `INSTALLED`; an available update reports
   `UPDATE_READY` without a 400 response.
5. `/liliane/` and other non-REVO resources are not handled by the REVO cache.
6. Compare 24-hour windows for SQL/request, notification-summary SQL volume,
   5xx, pool wait, and PWA failures. Early smoke data is not presented as a
   statistically equivalent before/after window.

## Deferred work and safety gates

- Enable `pg_stat_statements` only in a scheduled database maintenance window,
  with a current verified full backup and restart rollback.
- Add query-count percentiles and fingerprint rankings using bounded,
  low-cardinality aggregates; do not store SQL parameters or customer data.
- Profile MAPA and MATCH synchronization separately with controlled external
  dependencies before changing concurrency or schedules.
- Run progressive load tests in an isolated production-equivalent environment.
  No stress test is part of this release.
- Create a current verified full database backup before any future destructive
  maintenance. The audit found no clearly recent full backup suitable for a
  database-changing release.
