# Branches

## Branches operacionais

| Branch | Use it for | Do not use it for |
| --- | --- | --- |
| `master` | Stable integrated production baseline | Experimental implementation work |
| `retiradas` | Retiradas frontend, API, dashboards, integrations, and shared APIs it owns | Mercado-only or Operacao-only changes |
| `mercado` | Marketplace screens and Mercado API modules | Changing Retiradas behavior without compatibility coverage |
| `operacao` | Operacao frontend/backend and its HubSoft workflows | Retiradas/Mercado business rules |
| `homolog-dev` | Reviewed integration candidates for homologation | A long-lived personal feature branch |

## Worktree map

```text
cluster-retiradas  -> retiradas
cluster-mercado    -> mercado
cluster-operacao   -> operacao
cluster-integracao -> homolog-dev
```

Before editing, run:

```powershell
git branch --show-current
git status --short
```

If the result does not match the requested product, change to the corresponding
worktree instead of switching the branch in place.

## Promotion path

```text
feature or fix branch
  -> product branch
  -> homolog-dev
  -> master
```

Each transition requires the CI for the affected product. Mercado changes also
run Retiradas contracts because Mercado shares the Retiradas API and database
contracts.

## Preserved legacy references

The state found before this reorganization is retained through annotated tags
and archive branches. They are read-only recovery references; no new work
should start from them. The archive labels record the pre-baseline names and
the frozen production manifest records the live artifacts that were captured
before restructuring.

## Protection rules

- Do not force-push any operational branch.
- Do not merge `homolog-dev` back into a product branch automatically.
- Do not commit a generated `dist`, `coverage`, screenshots, or deploy bundle
  unless it is explicitly the versioned release artifact.
- Do not delete a legacy reference until a green release has been retained and
  the owner explicitly approves the cleanup.
